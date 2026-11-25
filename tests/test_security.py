"""Unit tests for password/session security helpers."""

from __future__ import annotations

from app.security import hash_password, hash_token, new_session_token, verify_password


def test_password_roundtrip() -> None:
    stored = hash_password("correct horse battery staple")
    algo, iters, salt, digest = stored.split("$")
    assert algo == "pbkdf2-sha256"
    assert int(iters) >= 200_000
    assert verify_password("correct horse battery staple", stored)


def test_wrong_password_rejected() -> None:
    stored = hash_password("secret-one")
    assert not verify_password("secret-two", stored)


def test_malformed_hash_rejected() -> None:
    assert not verify_password("x", "not-a-hash")
    assert not verify_password("x", "pbkdf2-sha256$abc$zz$yy")


def test_salts_differ() -> None:
    assert hash_password("same") != hash_password("same")


def test_token_hashing() -> None:
    token = new_session_token()
    assert len(token) >= 32
    assert hash_token(token) != token
    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != hash_token(new_session_token())
