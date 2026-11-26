"""Sign-quiz endpoint - server-built practice sets with answers included."""

from __future__ import annotations

import random

from fastapi import APIRouter

from app.schemas import QuestionOut, QuizSignsIn, QuizSignsOut
from app.api.deps import CurrentUser
from app.services import content, exams

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


@router.post("/signs", response_model=QuizSignsOut)
async def sign_quiz(body: QuizSignsIn, user: CurrentUser) -> QuizSignsOut:
    cats = {c["id"] for c in content.categories()}
    cat = body.cat if body.cat in cats or body.cat == "all" else "all"
    questions = exams.build_sign_quiz(cat, body.length, random.Random())
    return QuizSignsOut(questions=[QuestionOut(**q) for q in questions])
