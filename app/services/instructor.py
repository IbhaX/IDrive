"""AI driving instructor: retrieval over iDrive's own content + an
OpenAI-compatible chat model, with citations.

Guardrails:
- Answers are grounded in retrieved iDrive passages; the system prompt
  forbids inventing laws, section numbers, fines or unsafe instructions.
- Without a configured provider (or for guests) the endpoint degrades to
  `mode="search"`: it returns the best passages so the learner still gets a
  sourced answer.
- No fine amounts are produced; the model is told to point to Parivahan or
  the state MVD instead.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from app.services import curriculum

log = logging.getLogger("idrive.instructor")

MAX_PASSAGE = 900
TOP_K = 6

SYSTEM_PROMPT = """You are the iDrive driving-theory instructor for learners in India (with extra attention to Kerala).

Rules you must follow:
1. Base factual answers on the numbered SOURCES provided. Cite them inline like [1] or [2][4]. If the sources do not cover the question, say so plainly and suggest which iDrive section or official body (Parivahan, the Kerala MVD, the RTO) to check. You may use general physics or mechanical knowledge to explain a concept, but say when you are doing so.
2. Never invent traffic laws, section or rule numbers, deadlines or fine amounts. Do not state any fine or penalty amount at all — tell the learner to check the current figure on Parivahan or the state MVD, because amounts change and some vary by state.
3. Never give instructions that are unsafe or illegal (e.g. how to evade enforcement, drive impaired, or beat a breath test). For emergencies, always include calling 112 where relevant.
4. Be a patient instructor: short paragraphs, plain language, define jargon, use a concrete Indian road example when helpful. Keep answers under about 220 words unless asked for more.
5. When asked to quiz the learner, write 3 multiple-choice questions from the sources, then give the answers with one-line explanations at the end.
6. Mark simplified physics as an educational model."""


def _clip(text: str, n: int = MAX_PASSAGE) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def retrieve(question: str, k: int = TOP_K) -> list[dict[str, Any]]:
    """Top-k passages for the question, from lessons, articles, lights, parts, signs, glossary."""
    hits = curriculum.search(question, limit=k * 3)
    if not hits:
        # fall back to single-word matches for long natural-language questions
        words = sorted({w for w in re.findall(r"[a-zA-Z]{4,}", question.lower())}, key=len, reverse=True)[:4]
        seen: set[str] = set()
        hits = []
        for w in words:
            for h in curriculum.search(w, limit=k):
                key = h["kind"] + ":" + h["id"]
                if key not in seen:
                    seen.add(key)
                    hits.append(h)
    docs = {d["kind"] + ":" + d["id"]: d for d in curriculum.search_docs()}
    out: list[dict[str, Any]] = []
    for h in hits:
        d = docs.get(h["kind"] + ":" + h["id"])
        if not d:
            continue
        out.append({
            "n": len(out) + 1, "kind": h["kind"], "id": h["id"], "title": h["title"],
            "group": h["group"], "href": h["href"], "text": _clip(d["body"]),
        })
        if len(out) >= k:
            break
    return out


def _sources_block(sources: list[dict[str, Any]]) -> str:
    return "\n\n".join(f"[{s['n']}] {s['title']} ({s['group']})\n{s['text']}" for s in sources)


def _public(sources: list[dict[str, Any]], cited: Optional[set[int]] = None) -> list[dict[str, Any]]:
    return [
        {"n": s["n"], "kind": s["kind"], "id": s["id"], "title": s["title"], "group": s["group"],
         "href": s["href"], "snippet": _clip(s["text"], 220),
         "cited": (s["n"] in cited) if cited is not None else False}
        for s in sources
    ]


async def ask(
    question: str,
    history: list[dict[str, str]],
    *,
    api_key: str,
    base_url: str,
    model: str,
    allow_ai: bool,
    timeout: float = 30.0,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> dict[str, Any]:
    sources = retrieve(question)
    if not allow_ai or not api_key:
        return {
            "mode": "search",
            "reason": "signin" if api_key and not allow_ai else "disabled",
            "answer": None,
            "sources": _public(sources),
        }
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:1200]})
    messages.append({
        "role": "user",
        "content": f"SOURCES:\n{_sources_block(sources) or '(no matching iDrive sources)'}\n\nQUESTION: {question}",
    })
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            r = await client.post(
                base_url.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "X-Title": "iDrive"},
                json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 700},
            )
            r.raise_for_status()
            data = r.json()
            answer = str(data["choices"][0]["message"]["content"]).strip()
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        log.warning("instructor provider error: %s", e)
        return {"mode": "search", "reason": "provider_error", "answer": None, "sources": _public(sources)}
    cited = {int(n) for n in re.findall(r"\[(\d{1,2})\]", answer) if 0 < int(n) <= len(sources)}
    return {"mode": "ai", "reason": None, "answer": answer, "sources": _public(sources, cited)}
