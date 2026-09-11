"""
Fail-first cipher tests for the Drive token keyring (task 2.1).

Expected to FAIL (red) until task 2.2 lands ``backend.auth.token_cipher``. Seam
contract for implementers:

- AES-256-GCM. Every encrypt draws a fresh random 12-byte nonce. Associated
  data binds Dental ``user_id``, purpose, and key version.
- Purposes: ``token_cipher.PURPOSE_REFRESH_TOKEN = "refresh-token"`` and
  ``token_cipher.PURPOSE_BINDING_SECRET = "binding-secret"``.
- ``encrypt(user_id, purpose, plaintext, *, key_version=None) -> Ciphertext``.
  Default write version is ``config.GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION``.
- ``Ciphertext`` is a frozen dataclass: ``ciphertext: bytes``, ``nonce: bytes``
  (12 bytes), ``key_version: str``.
- ``decrypt(user_id, purpose, ct: Ciphertext) -> Decrypted`` where ``Decrypted``
  holds ``plaintext: bytes`` and ``rotated: Ciphertext | None``. ``rotated`` is
  non-None only when the stored version differs from the active version
  (lazy re-encryption under the active key).
- Wrong user, wrong purpose, tampered ciphertext, unknown key version, or
  authentication failure raises ``ValueError`` (fail closed; the caller maps it
  to sanitized revoked/unavailable state and performs no Google request).
- Keyring/active version are read from ``backend.config`` at call time so tests
  can monkeypatch them. ``JWT_SECRET`` is never imported or used.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def cipher(monkeypatch):
    from backend import config
    from backend.auth import token_cipher

    monkeypatch.setattr(
        config,
        "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS",
        {"1": bytes(range(32)), "2": bytes(range(32, 64))},
        raising=False,
    )
    monkeypatch.setattr(config, "GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION", "2", raising=False)
    return token_cipher


_USER_ID = "11111111-1111-1111-1111-111111111111"
_OTHER_USER_ID = "22222222-2222-2222-2222-222222222222"
_PLAINTEXT = b"1//refresh-token-plaintext"


def test_roundtrip_under_active_key(cipher):
    ct = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    assert ct.key_version == "2"
    result = cipher.decrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, ct)
    assert result.plaintext == _PLAINTEXT
    assert result.rotated is None


def test_every_encrypt_draws_fresh_nonce_and_ciphertext(cipher):
    ct1 = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    ct2 = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    assert len(ct1.nonce) == 12
    assert len(ct2.nonce) == 12
    assert ct1.nonce != ct2.nonce
    assert ct1.ciphertext != ct2.ciphertext


def test_ciphertext_never_contains_plaintext(cipher):
    ct = cipher.encrypt(_USER_ID, cipher.PURPOSE_BINDING_SECRET, b"binding-secret-value")
    assert _PLAINTEXT not in ct.ciphertext
    assert b"binding-secret-value" not in ct.ciphertext
    assert b"binding-secret-value" not in ct.nonce


def test_wrong_user_fails_closed(cipher):
    ct = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    with pytest.raises(ValueError):
        cipher.decrypt(_OTHER_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, ct)


def test_wrong_purpose_fails_closed(cipher):
    ct = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    with pytest.raises(ValueError):
        cipher.decrypt(_USER_ID, cipher.PURPOSE_BINDING_SECRET, ct)


def test_purpose_separation_produces_distinct_ciphertext(cipher):
    ct_refresh = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    ct_binding = cipher.encrypt(_USER_ID, cipher.PURPOSE_BINDING_SECRET, _PLAINTEXT)
    assert ct_refresh.ciphertext != ct_binding.ciphertext


def test_tampered_ciphertext_fails_closed(cipher):
    ct = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT)
    tampered = cipher.Ciphertext(
        ciphertext=bytes([ct.ciphertext[0] ^ 0xFF]) + ct.ciphertext[1:],
        nonce=ct.nonce,
        key_version=ct.key_version,
    )
    with pytest.raises(ValueError):
        cipher.decrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, tampered)


def test_unknown_key_version_fails_closed(cipher):
    with pytest.raises(ValueError):
        cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT, key_version="99")

    ct = cipher.Ciphertext(ciphertext=b"x", nonce=b"0" * 12, key_version="99")
    with pytest.raises(ValueError):
        cipher.decrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, ct)


def test_lazy_rotation_reencrypts_under_active_key(cipher):
    ct_old = cipher.encrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, _PLAINTEXT, key_version="1")
    assert ct_old.key_version == "1"

    result = cipher.decrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, ct_old)
    assert result.plaintext == _PLAINTEXT
    assert result.rotated is not None
    assert result.rotated.key_version == "2"
    assert result.rotated.ciphertext != ct_old.ciphertext

    again = cipher.decrypt(_USER_ID, cipher.PURPOSE_REFRESH_TOKEN, result.rotated)
    assert again.plaintext == _PLAINTEXT
    assert again.rotated is None


def test_binding_secret_rotation_follows_same_contract(cipher):
    ct_old = cipher.encrypt(_USER_ID, cipher.PURPOSE_BINDING_SECRET, b"secret", key_version="1")
    result = cipher.decrypt(_USER_ID, cipher.PURPOSE_BINDING_SECRET, ct_old)
    assert result.plaintext == b"secret"
    assert result.rotated is not None and result.rotated.key_version == "2"


def test_cipher_module_never_imports_jwt_secret(cipher):
    assert "JWT_SECRET" not in dir(cipher)
