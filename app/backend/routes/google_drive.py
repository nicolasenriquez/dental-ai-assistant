"""
Google Drive connection routes — the Drive boundary surface.

- ``GET  /status``: safe connection status for the frontend.
- ``POST /oauth/start``: the ONLY start contract — backend-built URL handoff.
- ``GET  /oauth/callback``: browser transport. Valid one-shot state → ``303
  See Other`` with an allowlisted ``result``; invalid security state → direct
  sanitized ``400 GOOGLE_DRIVE_OAUTH_STATE_INVALID`` before code exchange.
  The callback never emits HTTP 409.
- ``POST /disconnect``: explicit disconnect, always clears local credentials.

Invariants: refresh tokens and binding secrets exist only as ciphertext;
access tokens are request-local; Dental session survives denial, mismatch,
disconnect, revocation, and reconnect failure.
"""

from __future__ import annotations

import hashlib
import hmac
import inspect
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from backend import config
from backend.auth import token_cipher
from backend.auth.dependencies import COOKIE_NAME, get_current_user
from backend.auth.token_cipher import Ciphertext
from backend.auth.tokens import TokenError, decode_token
from backend.db import google_drive_repo, users_repo
from backend.integrations import google_drive, google_drive_oauth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google-drive", tags=["google-drive"])

STATE_COOKIE = "google_drive_oauth_state"
STATE_COOKIE_PATH = "/api/google-drive/oauth/callback"
STATE_TTL_SECONDS = 600

DRIVE_SCOPE = google_drive_oauth.DRIVE_SCOPE
FOLDER_NAME = google_drive_oauth.FOLDER_NAME


def _error(code: str, http_status: int) -> JSONResponse:
    """Sanitized stable domain error — no provider payloads or internals."""
    return JSONResponse(status_code=http_status, content={"error": code})


def _redirect_result(result: str) -> RedirectResponse:
    """303 to the fixed configured Assistant return URL with only ``result``.

    Every callback terminal path also clears the state cookie on the returned
    response (cookies set on FastAPI's injected ``response`` parameter are
    discarded when the endpoint returns a different Response object).
    """
    resp = RedirectResponse(
        url=f"{config.GOOGLE_DRIVE_RETURN_URL}?result={result}",
        status_code=status.HTTP_303_SEE_OTHER,
    )
    _clear_state_cookie(resp)
    return resp


def _require_same_origin(request: Request) -> None:
    """Reject cross-site Drive mutations before any Google or DB side effect."""
    origin = request.headers.get("Origin", "")
    if origin not in config.APP_ORIGINS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")


def _set_state_cookie(response: Response, raw_state: str) -> None:
    response.set_cookie(
        key=STATE_COOKIE,
        value=raw_state,
        max_age=STATE_TTL_SECONDS,
        httponly=True,
        secure=True,
        samesite="lax",
        path=STATE_COOKIE_PATH,
    )


def _clear_state_cookie(response: Response) -> None:
    """Delete with attributes symmetric to the setter so browsers honour it."""
    response.delete_cookie(
        key=STATE_COOKIE,
        path=STATE_COOKIE_PATH,
        httponly=True,
        secure=True,
        samesite="lax",
    )


def _session_fingerprint(session_raw: str | None) -> bytes:
    return hashlib.sha256((session_raw or "").encode()).digest()


def _state_hash(raw_state: str) -> bytes:
    return hashlib.sha256(raw_state.encode()).digest()


async def _maybe_await(value: Any) -> Any:
    """Tolerate both sync and async integration doubles at the route seam."""
    if inspect.isawaitable(value):
        return await value
    return value


async def _resolve_session_user(session_raw: str | None) -> dict[str, Any]:
    """Resolve the raw session cookie to a user row (401 on any failure).

    Mirrors ``get_current_user`` but operates on the raw cookie string so the
    callback can compare session fingerprints before strict JWT validation.
    """
    if not session_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(session_raw)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")
    user: dict[str, Any] | None = await users_repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )
    return user


async def _safe_revoke(token: str) -> None:
    """Best-effort credential cleanup; failure never breaks the boundary."""
    try:
        await google_drive_oauth.revoke_token(token)
    except Exception:
        logger.warning("Best-effort Drive credential revoke failed", exc_info=False)


# ---------------------------------------------------------------------------
# GET /api/google-drive/status
# ---------------------------------------------------------------------------


@router.get("/status")
async def drive_status(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Safe connection status. Folder identity never leaves the backend."""
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return {"configured": False, "status": "unconfigured"}

    row = await google_drive_repo.get_connection(user["id"])
    if row is None:
        return {"configured": True, "status": "disconnected"}
    if row.get("status") == "active":
        body: dict[str, Any] = {"configured": True, "status": "connected"}
        if row.get("folder_name"):
            body["workspace"] = {"folder_name": row["folder_name"]}
        return body
    return {"configured": True, "status": row.get("status")}


# ---------------------------------------------------------------------------
# POST /api/google-drive/oauth/start
# ---------------------------------------------------------------------------


@router.post("/oauth/start")
async def oauth_start(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
    session_raw: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> JSONResponse:
    """Create a one-shot user/session-bound transaction and return the
    backend-built authorization URL. No GET fallback, no return_to input."""
    _require_same_origin(request)

    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    expected_email: str | None = None
    if config.AUTH_MODE == "google":
        identity = await users_repo.get_google_identity(user["id"])
        email = (identity or {}).get("provider_email_snapshot") or ""
        if not email:
            # Same-origin JSON conflict; browser callback never emits 409.
            return _error("GOOGLE_DRIVE_ACCOUNT_MISMATCH", status.HTTP_409_CONFLICT)
        expected_email = str(email).strip().lower()

    raw_state = secrets.token_urlsafe(32)
    await google_drive_repo.create_oauth_transaction(
        state_hash=_state_hash(raw_state),
        user_id=str(user["id"]),
        session_fingerprint=_session_fingerprint(session_raw),
        expected_google_email=expected_email,
        folder_operation_id=uuid4(),
        expires_at=datetime.now(UTC) + timedelta(seconds=STATE_TTL_SECONDS),
    )

    authorization_url = await _maybe_await(
        google_drive_oauth.build_authorization_url(raw_state, expected_email)
    )
    body = JSONResponse(content={"authorization_url": authorization_url})
    _set_state_cookie(body, raw_state)
    return body


@router.get("/oauth/start", include_in_schema=False)
async def oauth_start_get() -> JSONResponse:
    """Explicit 405 so the SPA catch-all cannot swallow the POST-only path."""
    return _error("METHOD_NOT_ALLOWED", status.HTTP_405_METHOD_NOT_ALLOWED)


# ---------------------------------------------------------------------------
# GET /api/google-drive/oauth/callback (browser transport)
# ---------------------------------------------------------------------------


@router.get("/oauth/callback")
async def oauth_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    session_raw: str | None = Cookie(default=None, alias=COOKIE_NAME),
    state_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE),
) -> Response:
    """Validate the one-shot transaction, then exchange exactly once.

    The HttpOnly state cookie is the security anchor: a mismatched query
    state fails closed, an absent query state uses the cookie alone. Invalid
    security state returns direct 400 before any provider call or session
    decode. Every terminal path clears the state cookie.
    """
    invalid = _error("GOOGLE_DRIVE_OAUTH_STATE_INVALID", status.HTTP_400_BAD_REQUEST)
    _clear_state_cookie(invalid)

    if not state_cookie:
        return invalid
    if state and not hmac.compare_digest(state, state_cookie):
        return invalid
    raw_state = state_cookie

    txn = await google_drive_repo.get_oauth_transaction(_state_hash(raw_state))
    if txn is None:
        return invalid

    expires_at = txn.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if datetime.now(UTC) >= expires_at:
            return invalid

    stored_fp = bytes(txn.get("session_fingerprint") or b"")
    if not hmac.compare_digest(_session_fingerprint(session_raw), stored_fp):
        return invalid

    user = await _resolve_session_user(session_raw)
    if str(txn.get("user_id")) != str(user["id"]):
        return invalid

    claimed = await google_drive_repo.claim_oauth_transaction(_state_hash(raw_state))
    if claimed is None:
        return invalid
    txn = claimed

    if error:
        result = "consent_denied" if error == "access_denied" else "provider_error"
        return _redirect_result(result)
    if not code:
        return _redirect_result("provider_error")

    try:
        token_result = await google_drive_oauth.exchange_code(code)
    except Exception as exc:
        access_token = getattr(exc, "access_token", None)
        if access_token:
            await _safe_revoke(access_token)
        return _redirect_result("provider_error")

    if token_result is None or not getattr(token_result, "refresh_token", None):
        await _safe_revoke(getattr(token_result, "access_token", ""))
        return _redirect_result("provider_error")

    granted = getattr(token_result, "scopes", None)
    if granted is not None and granted != frozenset({DRIVE_SCOPE}):
        await _safe_revoke(token_result.access_token)
        return _redirect_result("provider_error")

    try:
        account_id, drive_email = await google_drive.about_user_email(token_result.access_token)
    except Exception:
        await _safe_revoke(token_result.access_token)
        return _redirect_result("provider_error")

    expected_email = txn.get("expected_google_email")
    if config.AUTH_MODE == "google" and (
        not drive_email or not expected_email or drive_email != str(expected_email).strip().lower()
    ):
        # Best-effort revoke; preserve any prior connection; no workspace.
        await _safe_revoke(token_result.access_token)
        return _redirect_result("account_mismatch")

    user_id = str(user["id"])
    existing = await google_drive_repo.get_connection(user_id)

    folder_id = None
    folder_name = None
    folder_creation_operation_id = None
    binding_ct: Ciphertext | None = None
    if existing and existing.get("google_account_id") == account_id:
        folder_id = existing.get("folder_id")
        folder_name = existing.get("folder_name")
        folder_creation_operation_id = existing.get("folder_creation_operation_id")
        if existing.get("binding_secret_ciphertext") is not None:
            binding_ct = Ciphertext(
                ciphertext=bytes(existing["binding_secret_ciphertext"]),
                nonce=bytes(existing["binding_secret_nonce"]),
                key_version=str(existing["binding_key_version"]),
            )

    if binding_ct is None:
        binding_ct = token_cipher.encrypt(
            user_id, token_cipher.PURPOSE_BINDING_SECRET, secrets.token_bytes(32)
        )

    operation_id = txn.get("folder_operation_id")
    if not folder_id:
        try:
            folder = await google_drive.create_folder(
                token_result.access_token, name=FOLDER_NAME, operation_id=operation_id
            )
        except Exception:
            await _safe_revoke(token_result.access_token)
            return _redirect_result("provider_error")
        folder_id = folder.get("id")
        folder_name = folder.get("name", FOLDER_NAME)
        folder_creation_operation_id = operation_id

    refresh_ct = token_cipher.encrypt(
        user_id, token_cipher.PURPOSE_REFRESH_TOKEN, token_result.refresh_token.encode()
    )

    connection_kwargs = dict(
        google_account_id=account_id,
        refresh_token_ciphertext=refresh_ct.ciphertext,
        refresh_token_nonce=refresh_ct.nonce,
        token_key_version=refresh_ct.key_version,
        binding_secret_ciphertext=binding_ct.ciphertext,
        binding_secret_nonce=binding_ct.nonce,
        binding_key_version=binding_ct.key_version,
        granted_scopes=[DRIVE_SCOPE],
        folder_id=folder_id,
        folder_name=folder_name,
        folder_creation_operation_id=folder_creation_operation_id,
    )
    if existing is None:
        await google_drive_repo.create_active_connection(user_id, **connection_kwargs)
    else:
        await google_drive_repo.replace_active_connection(user_id, **connection_kwargs)

    return _redirect_result("connected")


# ---------------------------------------------------------------------------
# POST /api/google-drive/disconnect
# ---------------------------------------------------------------------------


@router.post("/disconnect")
async def disconnect(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> JSONResponse:
    """Best-effort remote revoke; local credentials always cleared. Idempotent."""
    _require_same_origin(request)

    user_id = str(user["id"])
    row = await google_drive_repo.get_connection(user_id)

    if row and row.get("status") == "active" and row.get("refresh_token_ciphertext"):
        try:
            decrypted = token_cipher.decrypt(
                user_id,
                token_cipher.PURPOSE_REFRESH_TOKEN,
                Ciphertext(
                    ciphertext=bytes(row["refresh_token_ciphertext"]),
                    nonce=bytes(row["refresh_token_nonce"]),
                    key_version=str(row["token_key_version"]),
                ),
            )
            await _safe_revoke(decrypted.plaintext.decode())
        except ValueError:
            logger.warning("Drive disconnect could not decrypt refresh token", exc_info=False)

    await google_drive_repo.set_disconnected(user_id)
    return JSONResponse(content={"status": "disconnected"})
