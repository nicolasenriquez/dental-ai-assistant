"""
Fail-first configuration tests for the Google Drive connection boundary (task 2.1).

Expected to FAIL (red) until task 2.2 lands the Drive config constants in
``backend/config.py``. Seam contract for implementers:

- ``config.GOOGLE_DRIVE_CLIENT_ID``, ``config.GOOGLE_DRIVE_CLIENT_SECRET``,
  ``config.GOOGLE_DRIVE_OAUTH_REDIRECT_URI``, ``config.GOOGLE_DRIVE_RETURN_URL``:
  exact strings from the environment, empty when unset.
- ``config.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS``: dict mapping key version (str)
  to exactly 32 key bytes, decoded from URL-safe base64. Env format:
  ``GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS="1:<b64>,2:<b64>"``.
- ``config.GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION``: str version of the write key.
- ``config.GOOGLE_DRIVE_CONFIGURED``: bool. True only when every required value
  is present and valid (client id + secret, redirect URI, return URL, non-empty
  keyring, active version present in the keyring).
- Partial or malformed configuration raises ``RuntimeError`` at config import.
  Complete absence starts the app with ``GOOGLE_DRIVE_CONFIGURED=False``
  (``503 GOOGLE_DRIVE_NOT_CONFIGURED`` behavior is covered by the route tests).
- The Drive keyring is never derived from ``JWT_SECRET``.
"""

from __future__ import annotations

import base64
import importlib
from collections.abc import Iterator
from contextlib import contextmanager

import pytest

_DRIVE_ENV_VARS = (
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_OAUTH_REDIRECT_URI",
    "GOOGLE_DRIVE_RETURN_URL",
    "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS",
    "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION",
)

_KEY_1 = base64.urlsafe_b64encode(bytes(range(32))).decode()
_KEY_2 = base64.urlsafe_b64encode(bytes(range(32, 64))).decode()

_VALID_DRIVE_ENV = {
    "GOOGLE_DRIVE_CLIENT_ID": "drive-client.apps.googleusercontent.com",
    "GOOGLE_DRIVE_CLIENT_SECRET": "drive-client-secret",
    "GOOGLE_DRIVE_OAUTH_REDIRECT_URI": "https://chat.dynamous.ai/api/google-drive/oauth/callback",
    "GOOGLE_DRIVE_RETURN_URL": "https://chat.dynamous.ai/assistant",
    "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS": f"1:{_KEY_1},2:{_KEY_2}",
    "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION": "2",
}


def _reload_config():
    from backend import config

    return importlib.reload(config)


@contextmanager
def _config_with(monkeypatch: pytest.MonkeyPatch, env: dict[str, str]) -> Iterator[object]:
    """Reload config under a fresh Drive env block, then restore a valid state."""
    for var in _DRIVE_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    for var, value in env.items():
        monkeypatch.setenv(var, value)
    try:
        yield _reload_config()
    finally:
        for var in _DRIVE_ENV_VARS:
            monkeypatch.delenv(var, raising=False)
        _reload_config()


# ---------------------------------------------------------------------------
# Complete absence and complete configuration
# ---------------------------------------------------------------------------


def test_all_drive_config_absent_starts_unconfigured(monkeypatch):
    with _config_with(monkeypatch, {}) as cfg:
        assert cfg.GOOGLE_DRIVE_CONFIGURED is False
        assert cfg.GOOGLE_DRIVE_CLIENT_ID == ""


def test_complete_drive_config_parses(monkeypatch):
    with _config_with(monkeypatch, _VALID_DRIVE_ENV) as cfg:
        assert cfg.GOOGLE_DRIVE_CONFIGURED is True
        assert cfg.GOOGLE_DRIVE_CLIENT_ID == "drive-client.apps.googleusercontent.com"
        assert cfg.GOOGLE_DRIVE_CLIENT_SECRET == "drive-client-secret"
        assert (
            cfg.GOOGLE_DRIVE_OAUTH_REDIRECT_URI
            == "https://chat.dynamous.ai/api/google-drive/oauth/callback"
        )
        assert cfg.GOOGLE_DRIVE_RETURN_URL == "https://chat.dynamous.ai/assistant"
        keys = cfg.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS
        assert set(keys) == {"1", "2"}
        assert keys["1"] == bytes(range(32))
        assert keys["2"] == bytes(range(32, 64))
        assert cfg.GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION == "2"


# ---------------------------------------------------------------------------
# Partial and malformed configuration fails startup
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "env",
    [
        # client id only
        {"GOOGLE_DRIVE_CLIENT_ID": "id"},
        # client id + secret, missing everything else
        {"GOOGLE_DRIVE_CLIENT_ID": "id", "GOOGLE_DRIVE_CLIENT_SECRET": "s"},
        # keyring present but nothing else
        {"GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS": f"1:{_KEY_1}"},
        # active version without keyring
        {"GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION": "1"},
    ],
)
def test_partial_drive_config_fails_startup(monkeypatch, env):
    with pytest.raises(RuntimeError), _config_with(monkeypatch, env):
        pass


def test_active_key_version_missing_from_keyring_fails_startup(monkeypatch):
    env = dict(_VALID_DRIVE_ENV)
    env["GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION"] = "99"
    with pytest.raises(RuntimeError), _config_with(monkeypatch, env):
        pass


def test_malformed_key_base64_fails_startup(monkeypatch):
    env = dict(_VALID_DRIVE_ENV)
    env["GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS"] = "1:not-base64!!"
    with pytest.raises(RuntimeError), _config_with(monkeypatch, env):
        pass


def test_wrong_key_length_fails_startup(monkeypatch):
    short = base64.urlsafe_b64encode(b"too-short").decode()
    env = dict(_VALID_DRIVE_ENV)
    env["GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS"] = f"1:{short}"
    with pytest.raises(RuntimeError), _config_with(monkeypatch, env):
        pass


def test_drive_keyring_is_independent_of_jwt_secret(monkeypatch):
    env = dict(_VALID_DRIVE_ENV)
    monkeypatch.setenv("JWT_SECRET", "some-other-secret-value")
    try:
        with _config_with(monkeypatch, env) as cfg:
            keys = cfg.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS
            assert keys["1"] == bytes(range(32))  # decoded from keyring env, not JWT_SECRET
    finally:
        _reload_config()
