"""Single policy for Drive credential load, decrypt, refresh, rotate, revoke.

Both the Drive transport routes and the evolution export service resolve a
request-local access token through this module so revocation, rotation
persistence, and the error taxonomy can never drift between callers.

Contracts:
- Access tokens are never persisted; the refresh token stays ciphertext.
- Only permanent failures revoke: undecryptable ciphertext (including a
  corrupted row) and Google's ``GOOGLE_DRIVE_INVALID_GRANT``.
- Transient OAuth failures raise :class:`DriveCredentialsRefreshFailed` and
  leave the connection row active.
- Anything else (network, provider outages) propagates unchanged so each
  caller keeps its existing outer error handling.
"""

from __future__ import annotations

from typing import Any

from backend.auth import token_cipher
from backend.auth.token_cipher import Ciphertext
from backend.db import google_drive_repo
from backend.integrations import google_drive_oauth


class DriveCredentialsDisconnected(Exception):
    """No active connection row (or a revoked one; adapters may collapse both)."""


class DriveCredentialsRevoked(Exception):
    """Credentials permanently invalid; the row was marked revoked."""


class DriveCredentialsRefreshFailed(Exception):
    """Transient refresh failure; the connection row stays active."""

    def __init__(self, code: str | None = None) -> None:
        self.code = code
        super().__init__("Drive token refresh failed")


async def get_connection_access_token(owner_user_id: str) -> tuple[dict[str, Any], str]:
    """Active connection + one request-local access token (never persisted)."""
    row: dict[str, Any] | None = await google_drive_repo.get_connection(owner_user_id)
    if row is None or row.get("status") != "active":
        if row and row.get("status") == "revoked":
            raise DriveCredentialsRevoked
        raise DriveCredentialsDisconnected
    try:
        decrypted = token_cipher.decrypt(
            owner_user_id,
            token_cipher.PURPOSE_REFRESH_TOKEN,
            Ciphertext(
                ciphertext=bytes(row["refresh_token_ciphertext"]),
                nonce=bytes(row["refresh_token_nonce"]),
                key_version=str(row["token_key_version"]),
            ),
        )
        plaintext = decrypted.plaintext.decode("utf-8")
    except (KeyError, TypeError, UnicodeDecodeError, ValueError):
        await google_drive_repo.set_revoked(owner_user_id)
        raise DriveCredentialsRevoked from None
    try:
        token_result = await google_drive_oauth.refresh_access_token(plaintext)
    except google_drive_oauth.GoogleDriveOAuthError as exc:
        if exc.code == "GOOGLE_DRIVE_INVALID_GRANT":
            await google_drive_repo.set_revoked(owner_user_id)
            raise DriveCredentialsRevoked from None
        raise DriveCredentialsRefreshFailed(exc.code) from None
    if decrypted.rotated is not None:
        await google_drive_repo.update_refresh_token_ciphertext(owner_user_id, decrypted.rotated)
    return row, str(token_result.access_token)
