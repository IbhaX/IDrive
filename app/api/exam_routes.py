"""Exam endpoints — server-built papers; mock answers stay on the server."""

from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app.api.deps import DbDep, OptionalUser
from app.config import get_settings
from app.models import ExamAttempt, ExamPaper
from app.schemas import (
    AttemptOut,
    ExamMockOut,
    ExamPracticeIn,
    ExamPracticeOut,
    QuestionOut,
    ReviewItemOut,
    SubmitAnswersIn,
    SubmitResultOut,
)
from app.services import content, exams
from sqlalchemy import select

router = APIRouter(prefix="/api/exam", tags=["exam"])


@router.post("/mock", response_model=ExamMockOut, status_code=201, response_model_exclude_none=True)
async def start_mock(user: OptionalUser, db: DbDep) -> ExamMockOut:
    rng = random.Random(secrets.randbelow(2**63))
    questions = exams.build_mock(rng)
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(
        seconds=exams.MOCK_TOTAL * exams.SECONDS_PER_QUESTION
        + get_settings().exam_grace_seconds
    )
    paper = ExamPaper(
        id=secrets.token_urlsafe(16),
        user_id=user.id if user else None,
        mode="mock",
        topic="",
        payload={"questions": questions},
        status="open",
        deadline_at=deadline,
    )
    db.add(paper)
    await db.commit()
    return ExamMockOut(
        exam_id=paper.id,
        questions=[QuestionOut(**q) for q in exams.strip_answers(questions)],
        started_at=now,
        deadline_at=deadline,
        seconds_per_question=exams.SECONDS_PER_QUESTION,
    )


@router.post("/{exam_id}/submit", response_model=SubmitResultOut)
async def submit_mock(exam_id: str, body: SubmitAnswersIn, user: OptionalUser, db: DbDep) -> SubmitResultOut:
    paper = await db.get(ExamPaper, exam_id)
    if paper is None or paper.mode != "mock":
        raise HTTPException(status_code=404, detail={"detail": "exam not found", "code": "not_found"})

    stored = paper.payload.get("result")
    if stored is not None:  # idempotent re-submit returns the stored result
        return SubmitResultOut(exam_id=exam_id, **stored)

    questions = paper.payload["questions"]
    now = datetime.now(timezone.utc)
    deadline = paper.deadline_at
    if deadline is not None and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    late = bool(deadline and now > deadline)

    result = exams.score(questions, body.answers)
    passed = result["score"] >= exams.PASS_MARK
    stored_result = {
        "score": result["score"],
        "total": result["total"],
        "passed": passed,
        "late": late,
        "review": result["review"],
    }

    paper.status = "submitted"
    paper.payload = {**paper.payload, "result": stored_result}
    if user is not None:
        db.add(
            ExamAttempt(
                user_id=user.id,
                paper_id=paper.id,
                mode="mock",
                topic="",
                total=result["total"],
                score=result["score"],
                passed=1 if passed else 0,
                late=1 if late else 0,
            )
        )
    await db.commit()
    return SubmitResultOut(exam_id=exam_id, **stored_result)


@router.post("/practice", response_model=ExamPracticeOut)
async def practice(body: ExamPracticeIn) -> ExamPracticeOut:
    topic = body.topic
    valid = topic == "signs" or topic.startswith("sg:") or topic in content.topic_by_id()
    if topic.startswith("sg:"):
        valid = topic[3:] in content.cat_by_id()
    if not valid:
        raise HTTPException(status_code=400, detail={"detail": "unknown topic", "code": "bad_topic"})
    questions = exams.build_practice(topic, random.Random())
    return ExamPracticeOut(questions=[QuestionOut(**q) for q in questions])


@router.get("/attempts", response_model=list[AttemptOut])
async def attempts(user: OptionalUser, db: DbDep) -> list[AttemptOut]:
    if user is None:
        raise HTTPException(
            status_code=401, detail={"detail": "authentication required", "code": "auth_required"}
        )
    rows = (
        await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.user_id == user.id)
            .order_by(ExamAttempt.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        AttemptOut(
            id=r.id, mode=r.mode, topic=r.topic, total=r.total, score=r.score,
            passed=bool(r.passed), late=bool(r.late), created_at=r.created_at,
        )
        for r in rows
    ]
