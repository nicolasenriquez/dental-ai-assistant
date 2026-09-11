"""
Authenticated encryption for Google Drive credentials (AES-256-GCM keyring).

Purpose-separated, independently versioned from the Dental JWT. Every encrypt
draws a fresh 12-byte nonce; associated data binds Dental ``user_id``, purpose,
and key version. ``JWT_SECRET`` is never imported or used here.

Lazy rotation: decrypting under a non-active key re-encrypts the plaintext
under the active key in the same call; the caller persists the rotated
ciphertext. Old keys may be removed only once no row references them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend import config

PURPOSE_REFRESH_TOKEN = "refresh-token"
PURPOSE_BINDING_SECRET = "binding-secret"


@dataclass(frozen=True)
class Ciphertext:
    ciphertext: bytes
    nonce: bytes  # always 12 bytes
    key_version: str


@dataclass(frozen=True)
class Decrypted:
    plaintext: bytes
    rotated: Ciphertext | None  # set only when stored version != active version


def _key_bytes(version: str) -> bytes:
    keyring: dict[str, bytes] = config.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEYS
    key: bytes | None = keyring.get(version)
    if key is None:
        raise ValueError(f"unknown Drive token key version {version!r}")
    return key


def _aad(user_id: str, purpose: str, key_version: str) -> bytes:
    return f"v1|{purpose}|{key_version}|{user_id}".encode()


def encrypt(
    user_id: str,
    purpose: str,
    plaintext: bytes,
    *,
    key_version: str | None = None,
) -> Ciphertext:
    """Encrypt under the given or active key with a fresh random nonce."""
    version = key_version or config.GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION
    key = _key_bytes(version)
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, _aad(user_id, purpose, version))
    return Ciphertext(ciphertext=ciphertext, nonce=nonce, key_version=version)


def decrypt(user_id: str, purpose: str, ct: Ciphertext) -> Decrypted:
    """Decrypt; fail closed (ValueError) on any authentication mismatch."""
    key = _key_bytes(ct.key_version)
    try:
        plaintext = AESGCM(key).decrypt(
            ct.nonce, ct.ciphertext, _aad(user_id, purpose, ct.key_version)
        )
    except Exception as exc:
        raise ValueError("Drive credential decryption failed") from exc

    rotated: Ciphertext | None = None
    active = config.GOOGLE_DRIVE_TOKEN_ACTIVE_KEY_VERSION
    if ct.key_version != active:
        rotated = encrypt(user_id, purpose, plaintext, key_version=active)
    return Decrypted(plaintext=plaintext, rotated=rotated)
