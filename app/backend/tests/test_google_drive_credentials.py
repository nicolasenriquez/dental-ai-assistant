"""Shared Drive credential policy matrix (DUP-001): one policy, two adapters.

Proves both callers observe the same persisted state for every failure class:
invalid ciphertext and ``invalid_grant`` revoke; transient OAuth failures and
missing connections do not; rotation persists under the active key.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest

from backend import config
from backend.auth import token_cipher
from backend.db import google_drive_repo
from backend.evolution_exports import service as exports_service
from backend.integrations import google_drive, google_drive_credentials, google_drive_oauth
from backend.routes import google_drive as drive_routes

USER_ID = "00000000-0000-0000-0000-000000000001"
REFRESH_PLAINTEXT = b"refresh-plaintext"


@pytest.fixture(autouse=True)
def cipher_keys(monkeypatch):
    monkeypatch.setattr(
        config,
        "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS",
        {"1": bytes(range(32)), "2": bytes(range(32, 64))},
        raising=False,
    )
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "1", raising=False)


def _encrypted_row(status: str = "active", *, key_version: str = "1") -> dict:
    ct = token_cipher.encrypt(
        USER_ID, token_cipher.PURPOSE_REFRESH_TOKEN, REFRESH_PLAINTEXT, key_version=key_version
    )
    return {
        "id": UUID(int=7),
        "status": status,
        "refresh_token_ciphertext": ct.ciphertext,
        "refresh_token_nonce": ct.nonce,
        "token_key_version": ct.key_version,
        "folder_id": "folder-1",
    }


async def test_active_connection_refreshes_and_returns_row_and_token(monkeypatch):
    monkeypatch.setattr(google_drive_repo, "get_connection", _async_returning(_encrypted_row()))
    monkeypatch.setattr(
        google_drive_oauth,
        "refresh_access_token",
        _async_returning(SimpleNamespace(access_token="access-1")),
    )

    row, token = await google_drive_credentials.get_connection_access_token(USER_ID)

    assert token == "access-1"
    assert row["status"] == "active"


async def test_missing_and_nonactive_rows_distinguish_disconnected_and_revoked(monkeypatch):
    monkeypatch.setattr(google_drive_repo, "get_connection", _async_returning(None))
    with pytest.raises(google_drive_credentials.DriveCredentialsDisconnected):
        await google_drive_credentials.get_connection_access_token(USER_ID)

    monkeypatch.setattr(
        google_drive_repo, "get_connection", _async_returning(_encrypted_row(status="revoked"))
    )
    with pytest.raises(google_drive_credentials.DriveCredentialsRevoked):
        await google_drive_credentials.get_connection_access_token(USER_ID)

    monkeypatch.setattr(
        google_drive_repo, "get_connection", _async_returning(_encrypted_row(status="pending"))
    )
    with pytest.raises(google_drive_credentials.DriveCredentialsDisconnected):
        await google_drive_credentials.get_connection_access_token(USER_ID)


async def test_invalid_ciphertext_revokes_connection(monkeypatch):
    revoked: list[str] = []
    row = _encrypted_row()
    row["refresh_token_ciphertext"] = b"corrupted"
    monkeypatch.setattr(google_drive_repo, "get_connection", _async_returning(row))
    monkeypatch.setattr(google_drive_repo, "set_revoked", _capturing_async(revoked))

    with pytest.raises(google_drive_credentials.DriveCredentialsRevoked):
        await google_drive_credentials.get_connection_access_token(USER_ID)

    assert revoked == [USER_ID]


async def test_invalid_grant_revokes_connection(monkeypatch):
    revoked: list[str] = []
    monkeypatch.setattr(google_drive_repo, "get_connection", _async_returning(_encrypted_row()))
    monkeypatch.setattr(google_drive_repo, "set_revoked", _capturing_async(revoked))

    def refresh_fail(_token):
        raise google_drive_oauth.GoogleDriveOAuthError(
            "GOOGLE_DRIVE_INVALID_GRANT", "token revoked"
        )

    monkeypatch.setattr(google_drive_oauth, "refresh_access_token", refresh_fail)

    with pytest.raises(google_drive_credentials.DriveCredentialsRevoked):
        await google_drive_credentials.get_connection_access_token(USER_ID)

    assert revoked == [USER_ID]


async def test_transient_oauth_failure_never_revokes(monkeypatch):
    revoked: list[str] = []
    monkeypatch.setattr(google_drive_repo, "get_connection", _async_returning(_encrypted_row()))
    monkeypatch.setattr(google_drive_repo, "set_revoked", _capturing_async(revoked))

    def refresh_fail(_token):
        raise google_drive_oauth.GoogleDriveOAuthError("GOOGLE_DRIVE_RATE_LIMIT", "slow down")

    monkeypatch.setattr(google_drive_oauth, "refresh_access_token", refresh_fail)

    with pytest.raises(google_drive_credentials.DriveCredentialsRefreshFailed) as raised:
        await google_drive_credentials.get_connection_access_token(USER_ID)

    assert raised.value.code == "GOOGLE_DRIVE_RATE_LIMIT"
    assert revoked == []


async def test_rotation_persists_under_active_key(monkeypatch):
    rotated: list = []
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "2", raising=False)
    monkeypatch.setattr(
        google_drive_repo,
        "get_connection",
        _async_returning(_encrypted_row(key_version="1")),
    )

    async def rotate(owner, ct):
        rotated.append((owner, ct))
        return None

    monkeypatch.setattr(google_drive_repo, "update_refresh_token_ciphertext", rotate)
    monkeypatch.setattr(
        google_drive_oauth,
        "refresh_access_token",
        _async_returning(SimpleNamespace(access_token="access-rotated")),
    )

    _, token = await google_drive_credentials.get_connection_access_token(USER_ID)

    assert token == "access-rotated"
    assert len(rotated) == 1
    assert rotated[0][0] == USER_ID
    assert rotated[0][1].key_version == "2"


async def test_route_adapter_preserves_external_codes(monkeypatch):
    async def raise_disconnected(_user):
        raise google_drive_credentials.DriveCredentialsDisconnected

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_disconnected)
    with pytest.raises(drive_routes._DriveDomainError) as exc:
        await drive_routes._connection_access_token(USER_ID)
    assert exc.value.code == "GOOGLE_DRIVE_DISCONNECTED"
    assert exc.value.http_status == 409

    async def raise_revoked(_user):
        raise google_drive_credentials.DriveCredentialsRevoked

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_revoked)
    with pytest.raises(drive_routes._DriveDomainError) as exc:
        await drive_routes._connection_access_token(USER_ID)
    assert exc.value.code == "GOOGLE_DRIVE_REVOKED"
    assert exc.value.http_status == 403

    async def raise_refresh(_user):
        raise google_drive_credentials.DriveCredentialsRefreshFailed("GOOGLE_DRIVE_RATE_LIMIT")

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_refresh)
    with pytest.raises(drive_routes._DriveDomainError) as exc:
        await drive_routes._connection_access_token(USER_ID)
    assert exc.value.code == "GOOGLE_DRIVE_REFRESH_FAILED"
    assert exc.value.http_status == 503


async def test_export_adapter_collapses_connection_errors_and_passes_through_transient(monkeypatch):
    async def raise_disconnected(_user):
        raise google_drive_credentials.DriveCredentialsDisconnected

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_disconnected)
    with pytest.raises(google_drive.GoogleDriveError) as exc:
        await exports_service._connection_access_token(USER_ID)
    assert exc.value.code == "DRIVE_CONNECTION_REQUIRED"

    async def raise_revoked(_user):
        raise google_drive_credentials.DriveCredentialsRevoked

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_revoked)
    with pytest.raises(google_drive.GoogleDriveError) as exc:
        await exports_service._connection_access_token(USER_ID)
    assert exc.value.code == "DRIVE_CONNECTION_REQUIRED"

    async def raise_refresh(_user):
        raise google_drive_credentials.DriveCredentialsRefreshFailed("GOOGLE_DRIVE_RATE_LIMIT")

    monkeypatch.setattr(google_drive_credentials, "get_connection_access_token", raise_refresh)
    with pytest.raises(google_drive.GoogleDriveError) as exc:
        await exports_service._connection_access_token(USER_ID)
    assert exc.value.code == "GOOGLE_DRIVE_RATE_LIMIT"


def _async_returning(value):
    async def _fn(*_args, **_kwargs):
        return value

    return _fn


def _capturing_async(sink: list):
    async def _fn(*args, **kwargs):
        if kwargs:
            sink.append((args, kwargs))
        elif len(args) == 1:
            sink.append(args[0])
        else:
            sink.append(args)
        return None

    return _fn
