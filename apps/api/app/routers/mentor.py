"""CircuitMentor API — Socratic AI Mentor streaming router.

Supports OpenRouter (default / recommended) and direct Anthropic.
mode="question" → full circuit + ERC context, Socratic system prompt (hint-only)
mode="concept"  → free-form concept explanation, shorter prompt, no spoilers
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

import anthropic
import openai
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth.security import get_current_user
from app.config import settings
from app.models import User

router = APIRouter(prefix="/v1/mentor", tags=["mentor"])

# Load parts knowledge base
PARTS_KNOWLEDGE: dict[str, str] = {}
for candidate_dir in [
    Path(__file__).resolve().parent.parent.parent / "knowledge",
    Path(__file__).resolve().parent.parent / "knowledge",
    Path("knowledge"),
    Path("apps/api/knowledge"),
]:
    json_path = candidate_dir / "parts.json"
    if json_path.exists():
        try:
            with open(json_path, encoding="utf-8") as f:
                PARTS_KNOWLEDGE = json.load(f)
                break
        except Exception:
            pass


class MentorRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    hint_level: int = Field(1, ge=1, le=4)
    mode: Literal["question", "concept"] = "question"
    circuit: dict[str, Any] = Field(default_factory=dict)
    findings: list[dict[str, Any]] = Field(default_factory=list)


SYSTEM_QUESTION = """You are CircuitMentor, a Socratic electronics tutor for students.
Rules:
- The ERC findings are ground truth. Never contradict them or invent faults.
- You cannot edit the circuit. Never say you changed it; the student makes every change.
- Hint level 1: one guiding question, no answer. Level 2: name the principle involved.
  Level 3: say which part/connection to inspect, still without the exact fix.
  Level 4: you may show the worked example if the student has exhausted all hints.
- Under 120 words. Plain language. Reference parts by their labels."""

SYSTEM_CONCEPT = """You are CircuitMentor, a friendly electronics tutor.
The student is asking a free-form concept question.
Rules:
- Explain clearly and concisely, relating to their current circuit where relevant.
- Use analogies. Avoid jargon unless you define it immediately after.
- Under 180 words. Never give away a circuit fix they haven't asked for."""


def part_notes_for(circuit: dict[str, Any]) -> str:
    components = circuit.get("components", [])
    if not isinstance(components, list):
        return "None"

    part_ids = {
        c.get("partId")
        for c in components
        if isinstance(c, dict) and c.get("partId")
    }

    notes = [
        f"- {pid}: {PARTS_KNOWLEDGE.get(pid, 'Standard electronics component.')}"
        for pid in part_ids
        if pid
    ]
    return "\n".join(notes) if notes else "None"


def build_prompt(b: MentorRequest) -> str:
    if b.mode == "concept":
        return f"Student question: {b.message}"

    notes = part_notes_for(b.circuit)
    return (
        f"Hint level: {b.hint_level}\n"
        f"ERC findings: {json.dumps(b.findings)}\n"
        f"Circuit: {json.dumps(b.circuit)}\n"
        f"Part notes:\n{notes}\n\n"
        f"Student: {b.message}"
    )


@router.post("/stream")
async def stream_mentor(
    body: MentorRequest,
    user: User = Depends(get_current_user),
):
    system_prompt = SYSTEM_CONCEPT if body.mode == "concept" else SYSTEM_QUESTION

    async def event_generator():
        has_openrouter = bool(
            settings.openrouter_api_key
            and not settings.openrouter_api_key.startswith("your-")
        )
        has_anthropic = bool(
            settings.anthropic_api_key
            and not settings.anthropic_api_key.startswith("your-")
        )

        if not has_openrouter and not has_anthropic:
            yield (
                'event: error\n'
                'data: {"message": "Mentor is unavailable: Please set OPENROUTER_API_KEY in .env."}\n\n'
            )
            return

        try:
            if has_openrouter:
                client = openai.AsyncOpenAI(
                    base_url=settings.openrouter_base_url,
                    api_key=settings.openrouter_api_key,
                    default_headers={
                        "HTTP-Referer": settings.web_url,
                        "X-Title": "CircuitMentor",
                    },
                )
                stream = await client.chat.completions.create(
                    model=settings.mentor_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": build_prompt(body)},
                    ],
                    stream=True,
                    max_tokens=500,
                )
                async for chunk in stream:
                    delta_text = (
                        chunk.choices[0].delta.content
                        if chunk.choices and chunk.choices[0].delta
                        else ""
                    )
                    if delta_text:
                        yield f"data: {json.dumps({'t': delta_text})}\n\n"
                yield "data: [DONE]\n\n"

            else:
                anthropic_client = anthropic.AsyncAnthropic(
                    api_key=settings.anthropic_api_key
                )
                async with anthropic_client.messages.stream(
                    model=settings.mentor_model,
                    max_tokens=500,
                    system=system_prompt,
                    messages=[{"role": "user", "content": build_prompt(body)}],
                ) as s:
                    async for text in s.text_stream:
                        yield f"data: {json.dumps({'t': text})}\n\n"
                yield "data: [DONE]\n\n"

        except openai.APIError as exc:
            yield f'event: error\ndata: {{"message": "OpenRouter API error: {str(exc)}"}}\n\n'
        except anthropic.APIError as exc:
            yield f'event: error\ndata: {{"message": "Anthropic API error: {str(exc)}"}}\n\n'
        except Exception as exc:
            yield f'event: error\ndata: {{"message": "Mentor error: {str(exc)}"}}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
