"""Resume-scoped chat assistant endpoints.

Three modes, all keyed off a known resume_id so the assistant can ground
itself in the user's actual structured data:

  - qa      : free-form Q&A about the resume. Reply only, no proposal.
  - improve : suggests edits to the existing resume. Returns a proposal that
              the user must explicitly Apply (which goes through the existing
              PUT /resumes/{id}/json, so the backup table snapshots the prior
              state automatically).
  - tailor  : drafts a NEW resume based on the current one + a target context
              (job description, role, employer). Apply creates a separate
              resume row via POST /resumes/from-json.
"""

import copy
import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.database import db
from app.llm import chat_complete
from app.schemas import ResumeData, normalize_resume_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


# Output cap — proposals carry a full resume JSON, which is sizeable.
PROPOSAL_MAX_TOKENS = 6000
QA_MAX_TOKENS = 1024


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)
    mode: Literal["qa", "improve", "tailor"] = "qa"
    # For "tailor" mode the user's first message IS the target context; this
    # is just a convenience field for non-chat invocations.
    target: str | None = None
    temperature: float = Field(0.5, ge=0.0, le=1.0)


class ChatProposal(BaseModel):
    kind: Literal["edit", "create"]
    summary: str
    diff_summary: list[str] = Field(default_factory=list)
    resume_json: dict[str, Any]
    suggested_title: str | None = None


class ChatResponse(BaseModel):
    reply: str
    proposal: ChatProposal | None = None


def _get_resume_or_404(resume_id: str) -> dict[str, Any]:
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


def _resume_json_payload(resume: dict[str, Any]) -> dict[str, Any]:
    """Extract the structured resume dict (validated)."""
    data = resume.get("processed_data")
    if not data and resume.get("content_type") == "json":
        try:
            data = json.loads(resume["content"])
        except json.JSONDecodeError:
            data = None
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Resume JSON is unavailable")
    normalized = normalize_resume_data(copy.deepcopy(data))
    try:
        return ResumeData.model_validate(normalized).model_dump(mode="json")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail="Stored resume JSON is invalid") from e


BASE_PERSONA = (
    "You are the Resume Matcher assistant. You speak in second person, never "
    "use the first person, and keep replies concise (1-4 short sentences). "
    "No hype, no emoji. Help the user understand and improve their resume."
)


def _ground_in_resume(resume_title: str | None, resume_json: dict[str, Any]) -> str:
    """System-prompt snippet that pins the assistant to the user's data."""
    title = resume_title or "(untitled)"
    return (
        f"You have full read access to the user's resume titled '{title}'. "
        f"Treat the JSON below as ground truth — do not invent facts that aren't "
        f"there. If something isn't in the resume, say so.\n\n"
        f"RESUME_JSON:\n```json\n{json.dumps(resume_json, ensure_ascii=False)}\n```"
    )


def _proposal_instructions(kind: Literal["edit", "create"]) -> str:
    if kind == "edit":
        intent = (
            "The user wants you to suggest improvements to the resume above. "
            "Produce a complete replacement JSON that keeps the exact same "
            "schema (same top-level keys, same nested shape) and preserves "
            "all sections the user did not ask you to change. Only edit the "
            "fields that justify your suggested improvement."
        )
    else:
        intent = (
            "The user wants you to draft a NEW resume targeted at the context "
            "they described. Start from the existing resume above as a base, "
            "then rewrite headline/summary/bullets/skills to fit the target. "
            "Keep verifiable facts (employers, dates, schools) intact. The "
            "schema must match the existing resume exactly."
        )
    return (
        f"{intent}\n\n"
        "Respond with strict JSON only — no markdown fences, no prose outside "
        "the JSON. The JSON must have this shape:\n"
        '{\n'
        '  "reply": "1-3 sentence conversational explanation of what you changed and why",\n'
        '  "summary": "short headline for the proposal card (max 80 chars)",\n'
        '  "diff_summary": ["bullet 1", "bullet 2", ...]   // human readable list of changes\n'
        '  ,"resume_json": { ...full updated resume matching the schema above... }\n'
        + (
            '  ,"suggested_title": "short title for the new resume (max 60 chars)"\n'
            if kind == "create"
            else ""
        )
        + '}\n\n'
        "If you cannot safely produce the proposal (e.g. the user is just "
        "chatting), return {\"reply\": \"...\", \"resume_json\": null}."
    )


def _extract_json_block(text: str) -> str:
    """Best-effort: trim fences and isolate the first {...} block."""
    s = text.strip()
    if s.startswith("```"):
        # ```json\n...\n```  -> drop fences
        first_nl = s.find("\n")
        if first_nl != -1:
            s = s[first_nl + 1 :]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    start = s.find("{")
    if start == -1:
        return s
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return s[start:]


def _build_messages(
    history: list[ChatMessage], system_prompt: str
) -> tuple[str, list[dict[str, str]]]:
    """Return (system_prompt, openai-style messages array) for chat_complete."""
    msgs = [{"role": m.role, "content": m.content} for m in history]
    return system_prompt, msgs


@router.post("/resume/{resume_id}", response_model=ChatResponse)
async def chat_with_resume(resume_id: str, request: ChatRequest) -> ChatResponse:
    """Single chat turn scoped to a resume.

    For mode='qa' the LLM is asked for a plain reply. For mode='improve' or
    mode='tailor' the LLM is asked to emit structured JSON that the frontend
    renders as an Apply/Cancel proposal card.
    """
    resume = _get_resume_or_404(resume_id)
    resume_json = _resume_json_payload(resume)
    title = resume.get("title") or resume.get("filename")

    grounding = _ground_in_resume(title, resume_json)

    try:
        if request.mode == "qa":
            system_prompt = f"{BASE_PERSONA}\n\n{grounding}"
            _, msgs = _build_messages(request.messages, system_prompt)
            reply = await chat_complete(
                messages=msgs,
                system_prompt=system_prompt,
                temperature=request.temperature,
                max_tokens=QA_MAX_TOKENS,
            )
            return ChatResponse(reply=reply.strip(), proposal=None)

        kind: Literal["edit", "create"] = (
            "edit" if request.mode == "improve" else "create"
        )
        system_prompt = (
            f"{BASE_PERSONA}\n\n{grounding}\n\n{_proposal_instructions(kind)}"
        )

        msgs = [{"role": m.role, "content": m.content} for m in request.messages]
        # For tailor mode, append the explicit target hint if provided.
        if request.mode == "tailor" and request.target:
            msgs.append(
                {
                    "role": "user",
                    "content": f"Target context for the new resume: {request.target}",
                }
            )

        raw = await chat_complete(
            messages=msgs,
            system_prompt=system_prompt,
            temperature=request.temperature,
            max_tokens=PROPOSAL_MAX_TOKENS,
        )

        try:
            payload = json.loads(_extract_json_block(raw))
        except json.JSONDecodeError:
            logger.warning("Chat proposal: model returned non-JSON output")
            return ChatResponse(
                reply=(
                    "Drafting that proposal didn't produce a clean JSON. "
                    "Try rephrasing or splitting the request into smaller asks."
                ),
                proposal=None,
            )

        reply_text = str(payload.get("reply") or "").strip()
        proposed = payload.get("resume_json")

        if not isinstance(proposed, dict):
            # Conversational reply with no proposal — totally valid.
            return ChatResponse(reply=reply_text or "Okay.", proposal=None)

        try:
            validated = ResumeData.model_validate(
                normalize_resume_data(copy.deepcopy(proposed))
            ).model_dump(mode="json")
        except ValidationError:
            logger.warning("Chat proposal: proposed JSON failed schema validation")
            return ChatResponse(
                reply=(
                    reply_text
                    or "The draft didn't match the resume schema. Try again "
                    "or rephrase the request."
                ),
                proposal=None,
            )

        diff_summary_raw = payload.get("diff_summary") or []
        diff_summary = [
            str(x) for x in diff_summary_raw if isinstance(x, (str, int, float))
        ][:12]

        proposal = ChatProposal(
            kind=kind,
            summary=str(payload.get("summary") or "Proposed changes")[:120],
            diff_summary=diff_summary,
            resume_json=validated,
            suggested_title=(
                str(payload.get("suggested_title") or "")[:80] or None
                if kind == "create"
                else None
            ),
        )
        return ChatResponse(
            reply=reply_text or proposal.summary,
            proposal=proposal,
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Chat completion failed: {e}")
        raise HTTPException(
            status_code=502, detail="Assistant is unavailable. Try again."
        )
    except Exception as e:
        logger.error(f"Unexpected chat error: {e}")
        raise HTTPException(
            status_code=500, detail="Chat request failed. Please try again."
        )
