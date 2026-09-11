"""
Auth routes — signup, login, logout, me.

Session is an httpOnly + Secure + SameSite=Lax cookie named `session` carrying
a JWT signed with `JWT_SECRET`. The same-origin prod deployment means no CORS
gymnastics are required (see CLAUDE.md "Deployment").
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from backend import config, rate_limit, signup_rate_limit
from backend.auth.dependencies import COOKIE_NAME, get_current_user, is_admin_email
from backend.auth.password import hash_password, verify_password
from backend.auth.tokens import encode_token
from backend.config import JWT_EXPIRY_SECONDS, MEMBERSHIP_REFRESH_SECONDS
from backend.db import users_repo
from backend.db.postgres import get_pg_pool
from backend.integrations import circle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: str
    email: str


class MeResponse(BaseModel):
    """/me payload — user identity plus the current rate-limit counter.

    The counter is included on /me so the frontend can render the daily quota
    without a second round-trip on page load.

    `is_admin` is server-computed from ADMIN_USER_EMAIL and is a UX hint only —
    every /api/admin/* endpoint re-verifies via get_current_admin. The admin
    email itself never leaves the backend.
    """

    id: str
    email: str
    is_admin: bool
    is_member: bool
    messages_used_today: int
    messages_remaining_today: int
    rate_window_resets_at: str | None


def _set_session_cookie(response: Response, user_id: str) -> None:
    """Mint a JWT and attach it to the response as an httpOnly session cookie."""
    token = encode_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=JWT_EXPIRY_SECONDS,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    """Invalidate the session cookie on the client.

    Browsers only honour a `Set-Cookie` deletion directive when every
    attribute matches the original cookie — Secure, SameSite, HttpOnly, Path.
    Omitting any of them leaves the original cookie intact and the user stays
    authenticated until the JWT's own expiry (see issue #111). This helper is
    intentionally symmetric with `_set_session_cookie` so the two can't drift.
    """
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )


def _user_to_response(user: dict[str, Any]) -> UserResponse:
    return UserResponse(id=str(user["id"]), email=str(user["email"]))


def _provider_disabled() -> JSONResponse:
    """Stable 404 body for an auth provider disabled by AUTH_MODE."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND, content={"error": "AUTH_PROVIDER_DISABLED"}
    )


def _error(code: str, http_status: int) -> JSONResponse:
    """Sanitized stable domain error — no provider payloads or internals."""
    return JSONResponse(status_code=http_status, content={"error": code})


async def _finalize_dental_login(
    user: dict[str, Any], email: str, response: Response
) -> UserResponse:
    """Shared login finalization: last_login_at, Circle membership, session cookie.

    Local password login and Google login converge here so downstream code stays
    provider-blind — both end with the same Dental JWT/session cookie.
    """
    await users_repo.update_last_login(user["id"])

    # Re-verify Circle membership on every login. circle.verify_paid_member
    # is fail-closed (returns bool, never raises) so a Circle outage cannot
    # break login — the user falls back to non-member until the next /me
    # refresh resolves it.
    is_member = await circle.verify_paid_member(email)
    await users_repo.set_member_status(user["id"], is_member=is_member)

    _set_session_cookie(response, str(user["id"]))
    return UserResponse(id=str(user["id"]), email=email)


async def verify_google_id_token(credential: str) -> dict[str, Any]:
    """Verify a Google ID token through Google's maintained verifier.

    `google.oauth2.id_token.verify_oauth2_token` performs Google's signature,
    certificate, audience, issuer, and expiry validation. Application code must
    not reimplement JWT signature verification. Any provider failure or invalid
    token raises ValueError — callers map it to sanitized 401.
    """
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token as google_id_token

    try:
        return await asyncio.to_thread(
            google_id_token.verify_oauth2_token,
            credential,
            Request(),
            config.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise ValueError("Google identity verification failed") from exc


def _client_ip(request: Request) -> str:
    """Return the real client IP.

    With uvicorn's `--proxy-headers --forwarded-allow-ips="*"`, Starlette has
    already rewritten `request.client` to the left-most `X-Forwarded-For`
    value set by Caddy. We don't hand-parse the header in application code —
    the trust boundary is declared once, at process boot. See
    `signup_rate_limit.py` docstring for the threat model.
    """
    return request.client.host if request.client else "0.0.0.0"


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def signup(
    body: SignupRequest, request: Request, response: Response
) -> UserResponse | JSONResponse:
    """Create a user, set session cookie, return {id, email}.

    Order: rate-limit check → bcrypt → insert. Rate-limit is cheapest, runs
    first so bots can't burn CPU via repeated 429'd calls. Every attempt is
    audited to `signup_attempts` with its final outcome.

    Returns 429 on rate-limit (per-IP wins over global — more specific error),
    409 on duplicate email, 201 with session cookie on success.
    """
    if config.AUTH_MODE != "local":
        return _provider_disabled()

    ip = _client_ip(request)
    pool = get_pg_pool()

    async with pool.acquire() as conn, conn.transaction():
        try:
            await signup_rate_limit.check(ip, conn)
        except signup_rate_limit.SignupRateLimited as exc:
            outcome = "ip_limited" if exc.scope == "ip" else "global_limited"
            await signup_rate_limit.record(conn, ip=ip, email_attempted=body.email, outcome=outcome)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "signup_rate_limited",
                    "message": exc.message,
                    "scope": exc.scope,
                },
            )

        password_hash = hash_password(body.password)
        try:
            user = await users_repo.create_local_user(
                email=body.email, password_hash=password_hash, conn=conn
            )
        except asyncpg.UniqueViolationError as exc:
            # The user insert that raised left the transaction in an aborted
            # state (asyncpg's savepoint semantics). Record the duplicate on
            # a fresh connection so the audit row still lands; the outer txn
            # will roll back harmlessly.
            pool_for_record = get_pg_pool()
            async with pool_for_record.acquire() as record_conn:
                await signup_rate_limit.record(
                    record_conn, ip=ip, email_attempted=body.email, outcome="duplicate"
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            ) from exc

        await signup_rate_limit.record(conn, ip=ip, email_attempted=body.email, outcome="accepted")

    # Verify Circle membership AFTER the user-creation transaction commits.
    # Holding a DB connection across an external HTTP call would block the
    # pool for up to 5s. circle.verify_paid_member is fail-closed, never
    # raises — failures default to is_member=False; next /me will retry.
    is_member = await circle.verify_paid_member(body.email)
    await users_repo.set_member_status(user["id"], is_member=is_member)

    _set_session_cookie(response, str(user["id"]))
    return _user_to_response(user)


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, response: Response) -> UserResponse | JSONResponse:
    """Verify credentials and rotate session cookie. 401 on any failure."""
    if config.AUTH_MODE != "local":
        return _provider_disabled()

    user = await users_repo.get_user_by_email(body.email)
    # A null/absent password_hash means federated-only: treat as generic 401
    # before password verification, so a mode change can never make a
    # Google-only user password-loginable.
    password_hash = user.get("password_hash") if user else None
    if not user or not password_hash or not verify_password(body.password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    return await _finalize_dental_login(user, body.email, response)


@router.get("/config")
async def auth_config() -> JSONResponse:
    """Safe runtime authentication configuration for the frontend.

    The sole frontend authority for auth mode and Drive switches. Exposes only
    public client IDs — never secrets, tokens, session material, or OAuth state.
    """
    return JSONResponse(
        content={
            "mode": config.AUTH_MODE,
            "google_client_id": config.GOOGLE_CLIENT_ID if config.AUTH_MODE == "google" else None,
            "drive_enabled": config.GOOGLE_DRIVE_ENABLED,
            "drive_auto_onboard": config.GOOGLE_DRIVE_AUTO_ONBOARD,
        }
    )


def _google_request_context_valid(request: Request) -> bool:
    """GIS same-origin JSON request-context guard (CSRF boundary).

    Requires exact configured application Origin, `Sec-Fetch-Site: same-origin`
    when present, and `Content-Type: application/json` (charset parameters
    accepted). Runs before any token parsing or provider verification.
    """
    origin = request.headers.get("origin")
    if not origin or origin not in config.APP_ORIGINS:
        return False
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site is not None and fetch_site != "same-origin":
        return False
    content_type = request.headers.get("content-type", "")
    return content_type.split(";", 1)[0].strip().lower() == "application/json"


@router.post("/google", response_model=None)
async def google_login(request: Request, response: Response) -> UserResponse | JSONResponse:
    """Verify a Google ID token and issue the existing Dental session cookie.

    Order: mode gate → same-origin request-context guard → provider
    verification → exact identity claims → authoritative-email policy →
    identity mapping → shared finalization. Raw credentials and provider
    payloads never enter logs; failures are sanitized stable domain errors.
    """
    if config.AUTH_MODE != "google":
        return _provider_disabled()

    if not _google_request_context_valid(request):
        return _error("GOOGLE_AUTH_REQUEST_INVALID", status.HTTP_403_FORBIDDEN)

    try:
        payload = await request.json()
    except Exception:
        return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)
    credential = payload.get("credential") if isinstance(payload, dict) else None
    if not isinstance(credential, str) or not credential:
        return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)

    try:
        claims = await verify_google_id_token(credential)
    except ValueError:
        return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)

    sub = claims.get("sub")
    email = claims.get("email")
    email_verified = claims.get("email_verified")
    hd = claims.get("hd")
    # aud/iss/exp/signature are owned by the maintained verifier; the route
    # enforces the application claims the verifier does not validate.
    if (
        not isinstance(sub, str)
        or not sub
        or not isinstance(email, str)
        or not email
        or email_verified is not True
        or (hd is not None and (not isinstance(hd, str) or not hd.strip()))
    ):
        return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)

    # Authoritative-email policy: gmail.com suffix or non-empty Workspace hd.
    # A valid token with a non-authoritative email is rejected before any
    # identity mapping or session side-effects.
    if not email.lower().endswith("@gmail.com") and not (isinstance(hd, str) and hd.strip()):
        return _error("GOOGLE_EMAIL_NOT_AUTHORITATIVE", status.HTTP_403_FORBIDDEN)

    identity = await users_repo.find_identity("google", sub)
    if identity is not None:
        user = await users_repo.get_user_by_id(identity["user_id"])
        if user is None:
            return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)
        await users_repo.update_identity_email_snapshot("google", sub, email)
    else:
        # Never auto-link by email: an unknown Google sub presenting an email
        # owned by an existing Dental user is an explicit-link situation.
        if await users_repo.get_user_by_email(email) is not None:
            return _error("GOOGLE_ACCOUNT_LINK_REQUIRED", status.HTTP_409_CONFLICT)

        pool = get_pg_pool()
        async with pool.acquire() as conn:
            try:
                async with conn.transaction():
                    user = await users_repo.create_federated_user(email, conn=conn)
                    await users_repo.create_identity(
                        str(user["id"]), "google", sub, email, conn=conn
                    )
            except asyncpg.UniqueViolationError:
                # Concurrent sign-in created the identity first: adopt it.
                winner = await users_repo.find_identity("google", sub)
                if winner is None:
                    return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)
                user = await users_repo.get_user_by_id(winner["user_id"])
                if user is None:
                    return _error("GOOGLE_IDENTITY_INVALID", status.HTTP_401_UNAUTHORIZED)
                await users_repo.update_identity_email_snapshot("google", sub, email)

    # Response email is the verified identity email; Dental users.email stays
    # application-owned and is never silently reassigned.
    return await _finalize_dental_login(user, email, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    """Clear the session cookie. Always 204 — idempotent.

    Builds the response directly so the deletion Set-Cookie header lands on
    the wire; relying on the FastAPI-injected `response` object drops headers
    when we return a new `Response(...)`.
    """
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookie(response)
    return response


@router.get("/me", response_model=MeResponse)
async def me(user: dict[str, Any] = Depends(get_current_user)) -> MeResponse:
    """Return the currently-authenticated user plus their daily quota counter.

    Also opportunistically re-verifies Circle membership when the cached
    `member_verified_at` is older than `MEMBERSHIP_REFRESH_SECONDS`. This is
    the path that flips a previously-failed Circle check (e.g. API outage at
    login time) once Circle recovers, without requiring the user to log out
    and back in.
    """
    is_member = bool(user.get("is_member") or False)
    verified_at = user.get("member_verified_at")
    needs_refresh = verified_at is None or (
        (datetime.now(UTC) - verified_at).total_seconds() > MEMBERSHIP_REFRESH_SECONDS
    )
    if needs_refresh:
        is_member = await circle.verify_paid_member(str(user["email"]))
        await users_repo.set_member_status(user["id"], is_member=is_member)

    rl_status = await rate_limit.get_status(user["id"])
    return MeResponse(
        id=str(user["id"]),
        email=str(user["email"]),
        is_admin=is_admin_email(str(user["email"])),
        is_member=is_member,
        messages_used_today=rl_status.used,
        messages_remaining_today=rl_status.remaining,
        rate_window_resets_at=rl_status.resets_at.isoformat() if rl_status.resets_at else None,
    )
