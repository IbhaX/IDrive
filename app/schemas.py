"""Pydantic schemas for the IDrive API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

LangPair = list[str]  # [en, ml]


# ---------- auth ----------

class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    name: str = Field(default="", max_length=128)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class GoogleIn(BaseModel):
    credential: str = Field(min_length=20, max_length=4096)


class AuthConfigOut(BaseModel):
    google_client_id: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    lang: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


# ---------- content ----------

class SignOut(BaseModel):
    id: str
    cat: str
    name: str
    meaning: str
    action: str
    ml: list[str] = Field(default_factory=list)


class SignFullOut(SignOut):
    svg: str


class CategoryOut(BaseModel):
    id: str
    name: str
    dot: str
    blurb: str
    ml: list[str] = Field(default_factory=list)
    count: int = 0


class TopicOut(BaseModel):
    id: str
    name: LangPair
    dot: str
    lessons: list[LangPair] = Field(default_factory=list)
    hasArticle: bool = False


class ContentIndexOut(BaseModel):
    version: str
    categories: list[CategoryOut]
    signs: list[SignOut]
    topics: list[TopicOut]
    ui: dict[str, list[str]]
    primer: list[str] = Field(default_factory=list)
    glossaryCount: int
    questionCounts: dict[str, int]


class GlossaryEntryOut(BaseModel):
    term: LangPair
    definition: LangPair


# ---------- quiz / exam questions ----------

Bilingual = list[str]  # [en, ml]


class OptionItem(BaseModel):
    """A text option `[en, ml]` or an image option `{svg, n:[en,ml]}`."""

    model_config = ConfigDict(extra="allow")


class QuestionOut(BaseModel):
    """A question as sent to the client. `a`/`r` present only when the mode
    allows instant feedback (practice, sign quiz, post-submit review)."""

    id: str
    t: str  # topic id or "signs"
    q: Any  # [en, ml] or UI key ref
    o: list[Any]  # options: [en,ml] pairs or {svg, n:[en,ml]}
    a: Optional[int] = None
    r: Optional[list[str]] = None
    svg: Optional[str] = None
    io: bool = False  # image-option question
    type: Optional[str] = None  # sign-quiz kinds: "s2n" | "n2s"
    target: Optional[dict] = None  # sign-quiz target sign (for feedback)


class QuizSignsIn(BaseModel):
    cat: str = "all"
    length: int = Field(default=10, ge=1, le=50)


class QuizSignsOut(BaseModel):
    questions: list[QuestionOut]


class ExamMockOut(BaseModel):
    exam_id: str
    questions: list[QuestionOut]
    started_at: datetime
    deadline_at: datetime
    seconds_per_question: int


class ExamPracticeIn(BaseModel):
    topic: str = "signs"


class ExamPracticeOut(BaseModel):
    questions: list[QuestionOut]


class SubmitAnswersIn(BaseModel):
    answers: list[Optional[int]] = Field(max_length=60)


class ReviewItemOut(BaseModel):
    id: str
    t: str
    q: Any
    o: list[Any]
    a: int
    picked: Optional[int]
    correct: bool
    r: Optional[list[str]] = None
    svg: Optional[str] = None
    io: bool = False


class SubmitResultOut(BaseModel):
    exam_id: str
    score: int
    total: int
    passed: Optional[bool] = None  # mock only
    late: bool = False
    review: list[ReviewItemOut]


class AttemptOut(BaseModel):
    id: int
    mode: str
    topic: str
    total: int
    score: int
    passed: bool
    late: bool
    created_at: datetime


# ---------- progress ----------

class ProgressData(BaseModel):
    """Shape mirrors the source app's localStorage blob."""

    model_config = ConfigDict(extra="allow")

    seen: dict[str, int] = Field(default_factory=dict)
    box: dict[str, int] = Field(default_factory=dict)
    wrong: dict[str, int] = Field(default_factory=dict)
    best: int = 0
    played: int = 0
    lang: str = "both"
    mock: dict[str, int] = Field(default_factory=lambda: {"taken": 0, "passed": 0, "best": 0})
    tq: dict[str, list[int]] = Field(default_factory=dict)
    v: int = 1


class ProgressOut(BaseModel):
    data: dict[str, Any]
    version: int
    updated_at: Optional[datetime] = None


class ProgressIn(BaseModel):
    data: dict[str, Any]
    version: int = Field(ge=0)


class ProgressConflictOut(BaseModel):
    detail: str = "progress version conflict"
    code: str = "progress_conflict"
    server: ProgressOut


# ---------- instructor ----------

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class InstructorIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)


class InstructorSource(BaseModel):
    n: int
    kind: str
    id: str
    title: str
    group: str
    href: str
    snippet: str
    cited: bool = False


class InstructorOut(BaseModel):
    mode: Literal["ai", "search"]
    reason: Optional[str] = None
    answer: Optional[str] = None
    sources: list[InstructorSource]


# ---------- misc ----------

class OkOut(BaseModel):
    ok: bool = True


class ErrorBody(BaseModel):
    detail: str
    code: str = "error"


ModeLiteral = Literal["mock", "practice"]
