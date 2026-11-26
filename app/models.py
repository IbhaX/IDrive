"""SQLAlchemy models for IDrive."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    name: Mapped[str] = mapped_column(String(128), default="")
    lang: Mapped[str] = mapped_column(String(8), default="both")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Session(Base):
    """Bearer session. Only the SHA-256 of the raw token is stored."""

    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    user_agent: Mapped[str] = mapped_column(String(256), default="")


class UserProgress(Base):
    """Whole progress blob per user (seen/box/wrong/best/played/mock/tq/v).

    `version` enables optimistic-concurrency merges: PUT carries the version
    it was based on; a mismatch returns 409 + the server blob.
    """

    __tablename__ = "user_progress"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )


class ExamPaper(Base):
    """A generated exam/practice paper. The answer key never leaves the server
    for mock mode; the client sees it only after submit."""

    __tablename__ = "exam_papers"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    mode: Mapped[str] = mapped_column(String(16), default="mock")  # mock | practice
    topic: Mapped[str] = mapped_column(String(32), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)  # questions + answer key
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|submitted|expired
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (Index("ix_exam_papers_status", "status"),)


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    paper_id: Mapped[str] = mapped_column(String(40), default="")
    mode: Mapped[str] = mapped_column(String(16), default="mock")
    topic: Mapped[str] = mapped_column(String(32), default="")
    total: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[int] = mapped_column(Integer, default=0)  # bool as int
    late: Mapped[int] = mapped_column(Integer, default=0)  # submitted past deadline
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (Index("ix_exam_attempts_user_created", "user_id", "created_at"),)


class SignupAttribution(Base):
    """Where a new account came from (first/last ad click and UTM tags), sent
    by the browser at sign-up. Only filled when analytics/ads are in use and
    the visitor arrived with such parameters. Deleted with the account."""

    __tablename__ = "signup_attribution"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
