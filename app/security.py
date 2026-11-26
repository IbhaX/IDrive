"""Password hashing and session-token helpers (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from app.config import get_settings

_PBKDF2_ITERATIONS = 260_000
_ALGO = "pbkdf2-sha256"


def _pepper() -> bytes:
    return get_settings().secret_pepper.encode("utf-8")


def hash_password(password: str) -> str:
    """Return 'algo$iterations$salt_hex$hash_hex'. The iteration count is
    embedded so it can be raised later without breaking existing hashes."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8") + _pepper(), salt, _PBKDF2_ITERATIONS
    )
    return f"{_ALGO}${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_hex, digest_hex = stored.split("$")
        if algo != _ALGO:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8") + _pepper(),
            bytes.fromhex(salt_hex),
            int(iters_s),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, AttributeError):
        return False


def new_session_token() -> str:
    """Raw bearer token - shown to the client exactly once."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Only the hash is stored; DB leaks never expose live tokens."""
    return hashlib.sha256(token.encode("utf-8") + _pepper()).hexdigest()
