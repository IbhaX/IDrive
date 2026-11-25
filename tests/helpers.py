"""Shared test helpers."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


def answer_key(db_path: Path, exam_id: str) -> list[int]:
    """Read a mock paper's stored answer key straight from SQLite — tests can
    see it, real clients cannot."""
    con = sqlite3.connect(db_path)
    try:
        row = con.execute(
            "SELECT payload FROM exam_papers WHERE id = ?", (exam_id,)
        ).fetchone()
    finally:
        con.close()
    assert row is not None, "paper not stored"
    return [q["a"] for q in json.loads(row[0])["questions"]]
