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

import functools
import hashlib
import hmac
import inspect
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from backend import config
from backend.auth import token_cipher
from backend.auth.dependencies import COOKIE_NAME, get_current_user
from backend.auth.token_cipher import Ciphertext
from backend.auth.tokens import TokenError, decode_token
from backend.db import google_drive_repo, patients_repo, users_repo
from backend.integrations import google_drive, google_drive_oauth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google-drive", tags=["google-drive"])

STATE_COOKIE = "google_drive_oauth_state"
STATE_COOKIE_PATH = "/api/google-drive/oauth/callback"
STATE_TTL_SECONDS = 600

DRIVE_SCOPE = google_drive_oauth.DRIVE_SCOPE
FOLDER_NAME = google_drive_oauth.FOLDER_NAME

MAX_CONTENT_BYTES = google_drive.MAX_CONTENT_BYTES
PICKER_TOKEN_TTL_SECONDS = 300

_WRITE_AMBIGUOUS_CODES = {"DRIVE_UNAVAILABLE", "DRIVE_WRITE_UNKNOWN"}

_DRIVE_ERROR_HTTP: dict[str, int] = {
    "DRIVE_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
    "DRIVE_PAGE_TOKEN_INVALID": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "DRIVE_FILE_TOO_LARGE": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "DRIVE_FILE_ENCODING_INVALID": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "GOOGLE_DRIVE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "GOOGLE_DRIVE_ACCESS_DENIED": status.HTTP_403_FORBIDDEN,
}


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
    fetch_site = request.headers.get("Sec-Fetch-Site")
    if origin not in config.APP_ORIGINS or (fetch_site is not None and fetch_site != "same-origin"):
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
    if row.get("status") != "active":
        return {"configured": True, "status": row.get("status")}
    if row.get("pending_folder_operation_id"):
        return {"configured": True, "status": "workspace_recovery_pending"}

    try:
        _, access_token = await _connection_access_token(str(user["id"]))
        folder = await google_drive.get_folder(access_token, str(row.get("folder_id") or ""))
    except _DriveDomainError as exc:
        if exc.code == "GOOGLE_DRIVE_REVOKED":
            return {"configured": True, "status": "revoked"}
        return {"configured": True, "status": "workspace_missing"}
    except google_drive.GoogleDriveError:
        return {"configured": True, "status": "workspace_missing"}

    if not _folder_is_authoritative(folder, row.get("folder_creation_operation_id")):
        return {"configured": True, "status": "workspace_missing"}

    return {
        "configured": True,
        "status": "connected",
        "workspace": {
            "folder_name": str(row.get("folder_name") or (folder or {}).get("name") or FOLDER_NAME)
        },
    }


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

    The callback query state must match the HttpOnly state cookie. Invalid
    security state returns direct 400 before any provider call or session
    decode. Every terminal path clears the state cookie.
    """
    invalid = _error("GOOGLE_DRIVE_OAUTH_STATE_INVALID", status.HTTP_400_BAD_REQUEST)
    _clear_state_cookie(invalid)

    if not state_cookie or not state or not hmac.compare_digest(state, state_cookie):
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


# ---------------------------------------------------------------------------
# Phase 4 — managed patient Drive workspace (files, search, import, recovery)
# ---------------------------------------------------------------------------


class _DriveDomainError(Exception):
    """Stable route-level domain failure mapped to a sanitized JSON error."""

    def __init__(self, code: str, http_status: int) -> None:
        super().__init__(code)
        self.code = code
        self.http_status = http_status


def _managed_route(handler: Any) -> Any:
    """Map domain errors to sanitized JSON; revoked grants persist revoked state."""

    @functools.wraps(handler)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = kwargs.get("user")
        try:
            return await handler(*args, **kwargs)
        except _DriveDomainError as exc:
            return _error(exc.code, exc.http_status)
        except google_drive.GoogleDriveError as exc:
            if exc.code == "GOOGLE_DRIVE_UNAUTHORIZED" and user:
                await google_drive_repo.set_revoked(str(user["id"]))
                return _error("GOOGLE_DRIVE_REVOKED", status.HTTP_403_FORBIDDEN)
            http_status = _DRIVE_ERROR_HTTP.get(exc.code, status.HTTP_503_SERVICE_UNAVAILABLE)
            return _error(exc.code, http_status)

    return wrapped


async def _same_origin_dependency(request: Request) -> None:
    """Mutation boundary: reject cross-site requests before body parsing."""
    origin = request.headers.get("Origin", "")
    fetch_site = request.headers.get("Sec-Fetch-Site")
    content_type = request.headers.get("Content-Type", "")
    if (
        origin not in config.APP_ORIGINS
        or (fetch_site is not None and fetch_site != "same-origin")
        or content_type.split(";", 1)[0].strip().lower() != "application/json"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")


def _validate_opaque(value: str | None) -> bool:
    """Opaque Drive values: 1..2048 chars, no control characters."""
    if value is None:
        return True
    return 1 <= len(value) <= 2048 and all(ord(c) >= 32 and ord(c) != 127 for c in value)


def _patient_ref(secret: bytes, user_id: str, patient_id: str) -> str:
    payload = b"patient:v1\0" + UUID(user_id).bytes + UUID(patient_id).bytes
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _binding_mac(secret: bytes, file_id: str, patient_ref: str, user_id: str) -> str:
    payload = (
        b"file:v1\0"
        + file_id.encode()
        + b"\0"
        + UUID(user_id).bytes
        + bytes.fromhex(patient_ref)
        + b"\0"
        + b"1"
    )
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _file_properties(patient_ref: str, operation_id: str, binding_mac: str) -> dict[str, str]:
    return {
        "managedBy": google_drive.MANAGED_BY,
        "workspaceSchema": google_drive.WORKSPACE_SCHEMA,
        "patientRef": patient_ref,
        "bindingMac": binding_mac,
        "creationOperationId": operation_id,
    }


def _normalize_name(raw: str) -> str | None:
    """Backend owns TXT normalization: ``nota`` / ``nota.md`` -> ``nota.txt``."""
    name = raw.strip()
    if not name:
        return None
    lower = name.lower()
    if lower.endswith(".md"):
        name = name[:-3] + ".txt"
    elif not lower.endswith(".txt"):
        name = f"{name}.txt"
    return name


def _valid_name(name: str) -> bool:
    if not (1 <= len(name) <= 120):
        return False
    if any(ord(c) < 32 or ord(c) == 127 for c in name):
        return False
    if "/" in name or "\\" in name:
        return False
    return name.endswith(".txt")


async def _require_owned_patient(user_id: str, patient_id: UUID) -> None:
    patient = await patients_repo.get_patient(user_id, patient_id)
    if patient is None:
        raise _DriveDomainError("DRIVE_PATIENT_NOT_FOUND", status.HTTP_404_NOT_FOUND)


async def _connection_access_token(user_id: str) -> tuple[dict[str, Any], str]:
    """Active connection + one request-local access token (never persisted)."""
    row = await google_drive_repo.get_connection(user_id)
    if row is None or row.get("status") != "active":
        if row and row.get("status") == "revoked":
            raise _DriveDomainError("GOOGLE_DRIVE_REVOKED", status.HTTP_403_FORBIDDEN)
        raise _DriveDomainError("GOOGLE_DRIVE_DISCONNECTED", status.HTTP_409_CONFLICT)
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
    except ValueError:
        await google_drive_repo.set_revoked(user_id)
        raise _DriveDomainError("GOOGLE_DRIVE_REVOKED", status.HTTP_403_FORBIDDEN) from None
    try:
        token_result = await google_drive_oauth.refresh_access_token(decrypted.plaintext.decode())
    except Exception:
        raise _DriveDomainError(
            "GOOGLE_DRIVE_REFRESH_FAILED", status.HTTP_503_SERVICE_UNAVAILABLE
        ) from None
    return row, str(token_result.access_token)


def _binding_secret(user_id: str, row: dict[str, Any]) -> bytes:
    try:
        decrypted: token_cipher.Decrypted = token_cipher.decrypt(
            user_id,
            token_cipher.PURPOSE_BINDING_SECRET,
            Ciphertext(
                ciphertext=bytes(row["binding_secret_ciphertext"]),
                nonce=bytes(row["binding_secret_nonce"]),
                key_version=str(row["binding_key_version"]),
            ),
        )
    except ValueError:
        raise _DriveDomainError("GOOGLE_DRIVE_REVOKED", status.HTTP_403_FORBIDDEN) from None
    return cast(bytes, decrypted.plaintext)


def _folder_is_authoritative(folder: dict[str, Any] | None, expected_op: Any) -> bool:
    if not folder:
        return False
    if folder.get("mimeType") != "application/vnd.google-apps.folder":
        return False
    if folder.get("trashed"):
        return False
    properties = folder.get("appProperties") or {}
    if properties.get("managedBy") != google_drive.MANAGED_BY:
        return False
    if properties.get("workspaceSchema") != google_drive.WORKSPACE_SCHEMA:
        return False
    return expected_op is None or properties.get("creationOperationId") == str(expected_op)


async def _ensure_folder(user_id: str, row: dict[str, Any], access_token: str) -> str:
    """The persisted folder must verify before any file operation."""
    if row.get("pending_folder_operation_id"):
        raise _DriveDomainError("DRIVE_WORKSPACE_RECOVERY_PENDING", status.HTTP_409_CONFLICT)
    folder_id = row.get("folder_id")
    if not folder_id:
        raise _DriveDomainError("DRIVE_WORKSPACE_MISSING", status.HTTP_409_CONFLICT)
    folder = await google_drive.get_folder(access_token, str(folder_id))
    if not _folder_is_authoritative(folder, row.get("folder_creation_operation_id")):
        raise _DriveDomainError("DRIVE_WORKSPACE_MISSING", status.HTTP_409_CONFLICT)
    return str(folder_id)


def _verify_managed_file(
    metadata: dict[str, Any] | None,
    *,
    folder_id: str,
    patient_ref: str,
    binding_secret: bytes,
    user_id: str,
) -> bool:
    if not metadata or metadata.get("trashed"):
        return False
    if metadata.get("mimeType") != "text/plain":
        return False
    if not (metadata.get("name") or "").lower().endswith(".txt"):
        return False
    try:
        size = int(metadata.get("size") or -1)
    except (TypeError, ValueError):
        return False
    if not (0 <= size <= MAX_CONTENT_BYTES):
        return False
    if folder_id not in (metadata.get("parents") or []):
        return False
    properties = metadata.get("appProperties") or {}
    if properties.get("managedBy") != google_drive.MANAGED_BY:
        return False
    if properties.get("workspaceSchema") != google_drive.WORKSPACE_SCHEMA:
        return False
    if properties.get("patientRef") != patient_ref:
        return False
    if not properties.get("creationOperationId"):
        return False
    expected_mac = _binding_mac(binding_secret, str(metadata.get("id")), patient_ref, user_id)
    return hmac.compare_digest(str(properties.get("bindingMac") or ""), expected_mac)


def _file_body(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        key: metadata[key]
        for key in ("id", "name", "version", "mimeType", "modifiedTime")
        if key in metadata
    }


async def _create_with_binding(
    access_token: str,
    *,
    folder_id: str,
    name: str,
    content: bytes,
    operation_id: str,
    patient_ref: str,
    binding_secret: bytes,
    user_id: str,
) -> dict[str, Any]:
    """Create + file-ID-bound binding MAC. One reconciliation, no blind retry.

    The create call carries an operation-bound provisional MAC (the file ID
    does not exist yet); the metadata update completes the file-ID-bound MAC
    required by managed-file validation.
    """
    provisional = _binding_mac(binding_secret, operation_id, patient_ref, user_id)
    properties = _file_properties(patient_ref, operation_id, provisional)
    try:
        created = await google_drive.create_file(
            access_token,
            folder_id=folder_id,
            name=name,
            content=content,
            app_properties=properties,
        )
    except google_drive.GoogleDriveError as exc:
        if exc.code not in _WRITE_AMBIGUOUS_CODES:
            raise
        created = await _reconcile_created_file(
            access_token, operation_id, patient_ref, binding_secret, user_id, content
        )
    file_id = str(created["id"])
    final_properties = _file_properties(
        patient_ref, operation_id, _binding_mac(binding_secret, file_id, patient_ref, user_id)
    )
    try:
        updated: dict[str, Any] = await google_drive.update_file(
            access_token,
            file_id=file_id,
            content=content,
            app_properties=final_properties,
        )
        return updated
    except google_drive.GoogleDriveError as exc:
        if exc.code not in _WRITE_AMBIGUOUS_CODES:
            raise
        return await _reconcile_created_file(
            access_token, operation_id, patient_ref, binding_secret, user_id, content
        )


async def _reconcile_created_file(
    access_token: str,
    operation_id: str,
    patient_ref: str,
    binding_secret: bytes,
    user_id: str,
    content: bytes,
) -> dict[str, Any]:
    """One marker query after an ambiguous create; no match means unknown."""
    found = await google_drive.find_file_by_creation_operation(access_token, operation_id)
    if found is None:
        raise _DriveDomainError("DRIVE_WRITE_UNKNOWN", status.HTTP_503_SERVICE_UNAVAILABLE)
    file_id = str(found["id"])
    properties = _file_properties(
        patient_ref, operation_id, _binding_mac(binding_secret, file_id, patient_ref, user_id)
    )
    updated: dict[str, Any] = await google_drive.update_file(
        access_token,
        file_id=file_id,
        content=content,
        app_properties=properties,
    )
    return updated


# ---------------------------------------------------------------------------
# POST /api/google-drive/workspace/recreate
# ---------------------------------------------------------------------------


class _RecreateBody(BaseModel):
    operation_id: UUID
    acknowledge_possible_orphan: bool


@router.post("/workspace/recreate", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def recreate_workspace(
    body: _RecreateBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Explicit recreation with one new operation marker; orphan needs consent."""
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    row, access_token = await _connection_access_token(user_id)

    pending = row.get("pending_folder_operation_id")
    if pending:
        folders = await google_drive.find_folder_by_creation_operation(access_token, str(pending))
        if folders:
            folder = folders[0]
            await google_drive_repo.complete_folder_operation(
                user_id,
                folder_id=str(folder["id"]),
                folder_name=str(folder.get("name") or FOLDER_NAME),
                operation_id=pending,
            )
            return {"status": "workspace_available"}
        if not body.acknowledge_possible_orphan:
            raise _DriveDomainError("DRIVE_WORKSPACE_RECOVERY_PENDING", status.HTTP_409_CONFLICT)

    operation_id = str(body.operation_id)
    await google_drive_repo.set_pending_folder_operation(user_id, operation_id)
    try:
        folder = await google_drive.create_folder(
            access_token, name=FOLDER_NAME, operation_id=operation_id
        )
    except google_drive.GoogleDriveError as exc:
        if exc.code not in _WRITE_AMBIGUOUS_CODES:
            raise
        await google_drive_repo.mark_workspace_recovery_pending(user_id, operation_id)
        raise _DriveDomainError(
            "DRIVE_WORKSPACE_RECOVERY_PENDING", status.HTTP_409_CONFLICT
        ) from None
    await google_drive_repo.complete_folder_operation(
        user_id,
        folder_id=str(folder["id"]),
        folder_name=str(folder.get("name") or FOLDER_NAME),
        operation_id=operation_id,
    )
    return {"status": "workspace_available"}


# ---------------------------------------------------------------------------
# GET  /api/google-drive/files            (patient-scoped list)
# POST /api/google-drive/files/search     (body-scoped search)
# GET  /api/google-drive/files/{file_id}  (validated read)
# POST /api/google-drive/files            (create managed TXT)
# PUT  /api/google-drive/files/{file_id}  (optimistic update)
# ---------------------------------------------------------------------------


class _SearchBody(BaseModel):
    patient_id: UUID
    query: str
    page_token: str | None = None


class _CreateBody(BaseModel):
    patient_id: UUID
    operation_id: UUID
    name: str
    content: str


class _UpdateBody(BaseModel):
    patient_id: UUID
    operation_id: UUID
    content: str
    expected_version: str


class _PickerTokenBody(BaseModel):
    patient_id: UUID


class _ImportCopyBody(BaseModel):
    patient_id: UUID
    operation_id: UUID
    source_file_id: str
    name: str | None = None


def _validated_content(content: str) -> bytes:
    if not content.strip():
        raise _DriveDomainError("DRIVE_CONTENT_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    content_bytes = content.encode("utf-8")
    if len(content_bytes) > MAX_CONTENT_BYTES:
        raise _DriveDomainError("DRIVE_FILE_TOO_LARGE", status.HTTP_422_UNPROCESSABLE_ENTITY)
    return content_bytes


def _normalized_managed_name(raw: str) -> str:
    name = _normalize_name(raw)
    if name is None or not _valid_name(name):
        raise _DriveDomainError("DRIVE_FILE_NAME_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    return name


async def _managed_context(
    user: dict[str, Any], patient_id: UUID
) -> tuple[dict[str, Any], str, str, bytes, str]:
    """Owned patient + active connection + verified folder + patient binding."""
    user_id = str(user["id"])
    await _require_owned_patient(user_id, patient_id)
    row, access_token = await _connection_access_token(user_id)
    folder_id = await _ensure_folder(user_id, row, access_token)
    secret = _binding_secret(user_id, row)
    patient_ref = _patient_ref(secret, user_id, str(patient_id))
    return row, access_token, folder_id, secret, patient_ref


@router.get("/files")
@_managed_route
async def list_managed_files(
    patient_id: UUID,
    page_token: str | None = None,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not _validate_opaque(page_token):
        return _error("DRIVE_OPAQUE_ID_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, patient_id)
    result = await google_drive.list_files(
        access_token,
        folder_id=folder_id,
        patient_ref=patient_ref,
        page_token=page_token,
    )
    files = [
        _file_body(metadata)
        for metadata in result["files"]
        if _verify_managed_file(
            metadata,
            folder_id=folder_id,
            patient_ref=patient_ref,
            binding_secret=secret,
            user_id=user_id,
        )
    ]
    return {"files": files, "next_page_token": result.get("next_page_token")}


@router.post("/files/search", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def search_managed_files(
    body: _SearchBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)
    if not _validate_opaque(body.page_token):
        return _error("DRIVE_OPAQUE_ID_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    query = body.query.strip()
    if not (1 <= len(query) <= 200):
        return _error("DRIVE_QUERY_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)

    user_id = str(user["id"])
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, body.patient_id)
    result = await google_drive.list_files(
        access_token,
        folder_id=folder_id,
        patient_ref=patient_ref,
        page_token=body.page_token,
        name_query=query,
    )
    files = [
        _file_body(metadata)
        for metadata in result["files"]
        if _verify_managed_file(
            metadata,
            folder_id=folder_id,
            patient_ref=patient_ref,
            binding_secret=secret,
            user_id=user_id,
        )
    ]
    return {"files": files, "next_page_token": result.get("next_page_token")}


@router.get("/files/{file_id}")
@_managed_route
async def read_managed_file(
    file_id: str,
    patient_id: UUID,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not _validate_opaque(file_id):
        return _error("DRIVE_OPAQUE_ID_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, patient_id)
    metadata = await google_drive.get_file_metadata(access_token, file_id)
    if not _verify_managed_file(
        metadata,
        folder_id=folder_id,
        patient_ref=patient_ref,
        binding_secret=secret,
        user_id=user_id,
    ):
        raise _DriveDomainError("DRIVE_FILE_NOT_MANAGED", status.HTTP_404_NOT_FOUND)
    content = await google_drive.download_file(access_token, file_id)
    return {**_file_body(metadata), "content": content.decode("utf-8")}


@router.post("/files", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def create_managed_file(
    body: _CreateBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    name = _normalized_managed_name(body.name)
    content = _validated_content(body.content)
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, body.patient_id)

    created = await _create_with_binding(
        access_token,
        folder_id=folder_id,
        name=name,
        content=content,
        operation_id=str(body.operation_id),
        patient_ref=patient_ref,
        binding_secret=secret,
        user_id=user_id,
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_file_body(created))


@router.put("/files/{file_id}", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def update_managed_file(
    file_id: str,
    body: _UpdateBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not _validate_opaque(file_id):
        return _error("DRIVE_OPAQUE_ID_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    content = _validated_content(body.content)
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, body.patient_id)

    metadata = await google_drive.get_file_metadata(access_token, file_id)
    if not _verify_managed_file(
        metadata,
        folder_id=folder_id,
        patient_ref=patient_ref,
        binding_secret=secret,
        user_id=user_id,
    ):
        raise _DriveDomainError("DRIVE_FILE_NOT_MANAGED", status.HTTP_404_NOT_FOUND)
    if str(metadata.get("version") or "") != body.expected_version:
        raise _DriveDomainError("DRIVE_FILE_CHANGED", status.HTTP_409_CONFLICT)

    operation_id = str(body.operation_id)
    existing_properties = metadata.get("appProperties") or {}
    properties = _file_properties(
        patient_ref, operation_id, str(existing_properties.get("bindingMac") or "")
    )
    properties["lastOperationId"] = operation_id

    try:
        updated = await google_drive.update_file(
            access_token,
            file_id=file_id,
            content=content,
            app_properties=properties,
        )
    except google_drive.GoogleDriveError as exc:
        if exc.code not in _WRITE_AMBIGUOUS_CODES:
            raise
        fresh = await google_drive.get_file_metadata(access_token, file_id)
        fresh_properties = (fresh or {}).get("appProperties") or {}
        if fresh_properties.get("lastOperationId") == operation_id:
            return _file_body(fresh)
        raise _DriveDomainError(
            "DRIVE_WRITE_UNKNOWN", status.HTTP_503_SERVICE_UNAVAILABLE
        ) from None
    return _file_body(updated)


# ---------------------------------------------------------------------------
# POST /api/google-drive/picker-token   (no-store token for raw PickerBuilder)
# POST /api/google-drive/import-copy    (untrusted source -> managed TXT copy)
# ---------------------------------------------------------------------------


@router.post("/picker-token", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def picker_token(
    body: _PickerTokenBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    await _require_owned_patient(user_id, body.patient_id)
    _, access_token = await _connection_access_token(user_id)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"access_token": access_token, "expires_in": PICKER_TOKEN_TTL_SECONDS},
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@router.post("/import-copy", dependencies=[Depends(_same_origin_dependency)])
@_managed_route
async def import_copy(
    body: _ImportCopyBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    if not _validate_opaque(body.source_file_id):
        return _error("DRIVE_OPAQUE_ID_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    if not config.GOOGLE_DRIVE_CONFIGURED:
        return _error("GOOGLE_DRIVE_NOT_CONFIGURED", status.HTTP_503_SERVICE_UNAVAILABLE)

    user_id = str(user["id"])
    _, access_token, folder_id, secret, patient_ref = await _managed_context(user, body.patient_id)

    source = await google_drive.get_file_metadata(access_token, body.source_file_id)
    if not source:
        raise _DriveDomainError("DRIVE_FILE_NOT_MANAGED", status.HTTP_404_NOT_FOUND)
    source_properties = source.get("appProperties") or {}
    if source_properties.get("managedBy") == google_drive.MANAGED_BY:
        raise _DriveDomainError("DRIVE_FILE_NOT_MANAGED", status.HTTP_404_NOT_FOUND)
    if source.get("trashed"):
        raise _DriveDomainError("DRIVE_FILE_NOT_MANAGED", status.HTTP_404_NOT_FOUND)

    mime_type = (source.get("mimeType") or "").lower()
    source_name = (source.get("name") or "").lower()
    markdown_source = mime_type == "text/markdown" and source_name.endswith(".md")
    txt_source = mime_type == "text/plain" and source_name.endswith(".txt")
    if not (markdown_source or txt_source):
        raise _DriveDomainError("DRIVE_IMPORT_SOURCE_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY)
    try:
        source_size = int(source.get("size") or -1)
    except (TypeError, ValueError):
        raise _DriveDomainError(
            "DRIVE_IMPORT_SOURCE_INVALID", status.HTTP_422_UNPROCESSABLE_ENTITY
        ) from None
    if source_size > MAX_CONTENT_BYTES:
        raise _DriveDomainError("DRIVE_FILE_TOO_LARGE", status.HTTP_422_UNPROCESSABLE_ENTITY)

    raw = await google_drive.download_file(access_token, body.source_file_id)
    text = raw.decode("utf-8")
    if markdown_source:
        text = google_drive.serialize_markdown_to_plain_text(text)
    content = text.encode("utf-8")
    if len(content) > MAX_CONTENT_BYTES:
        raise _DriveDomainError("DRIVE_FILE_TOO_LARGE", status.HTTP_422_UNPROCESSABLE_ENTITY)

    name = _normalized_managed_name(str(body.name or source.get("name") or ""))

    created = await _create_with_binding(
        access_token,
        folder_id=folder_id,
        name=name,
        content=content,
        operation_id=str(body.operation_id),
        patient_ref=patient_ref,
        binding_secret=secret,
        user_id=user_id,
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=_file_body(created))
