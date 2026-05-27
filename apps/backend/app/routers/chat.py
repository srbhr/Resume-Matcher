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

Document chat endpoints (POST /chat/document/...) extend the above to
cover letters, outreach messages, and CVs with per-hunk diff approval.
"""

import copy
import json
import logging
import re
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.database import db
from app.llm import chat_complete
from app.schemas import (
    ApplyHunksRequest,
    ApplyHunksResponse,
    DiffHunk,
    DocumentChatRequest,
    DocumentChatResponse,
    EditProposal,
    ResumeData,
    normalize_resume_data,
)
from app.services.diff_engine import compute_resume_hunks, compute_text_hunks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])

# ---------------------------------------------------------------------------
# Server-side cache for proposed JSON (keyed by proposal_id).
# Populated when an edit proposal is generated; consumed (and removed) when
# the user applies it. Single-user app — an in-memory dict is sufficient.
# ---------------------------------------------------------------------------
_proposal_json_cache: dict[str, dict[str, Any]] = {}

_SECTION_DESCRIPTION_RE = re.compile(
    r"^([a-zA-Z]+)\[(\d+)\]\.description$"
)
_SECTION_INDEX_RE = re.compile(
    r"^([a-zA-Z]+)\[(\d+)\]$"
)


def _revert_hunks_in_proposed(
    original_json: dict[str, Any],
    proposed_json: dict[str, Any],
    rejected_hunks: list[DiffHunk],
) -> dict[str, Any]:
    """Start from proposed JSON and undo the rejected hunks.

    For each rejected hunk we reverse the specific change so that only the
    accepted hunks remain in the final result.
    """
    result = copy.deepcopy(proposed_json)

    for hunk in rejected_hunks:
        path = hunk.field_path
        ctype = hunk.change_type
        if not path or not ctype:
            continue

        try:
            if path == "summary":
                result["summary"] = original_json.get("summary", "")

            elif path == "additional.technicalSkills":
                additional = result.setdefault("additional", {})
                items: list[str] = additional.setdefault("technicalSkills", [])
                if ctype == "added":
                    proposed_lower = (hunk.proposed_text or "").casefold()
                    additional["technicalSkills"] = [
                        s for s in items
                        if not (isinstance(s, str) and s.casefold() == proposed_lower)
                    ]
                elif ctype == "removed" and hunk.original_text:
                    existing_lower = {s.casefold() for s in items if isinstance(s, str)}
                    if hunk.original_text.casefold() not in existing_lower:
                        items.append(hunk.original_text)

            elif path == "additional.certificationsTraining":
                additional = result.setdefault("additional", {})
                items = additional.setdefault("certificationsTraining", [])
                if ctype == "added":
                    proposed_lower = (hunk.proposed_text or "").casefold()
                    additional["certificationsTraining"] = [
                        s for s in items
                        if not (isinstance(s, str) and s.casefold() == proposed_lower)
                    ]
                elif ctype == "removed" and hunk.original_text:
                    existing_lower = {s.casefold() for s in items if isinstance(s, str)}
                    if hunk.original_text.casefold() not in existing_lower:
                        items.append(hunk.original_text)

            else:
                desc_m = _SECTION_DESCRIPTION_RE.match(path)
                entry_m = _SECTION_INDEX_RE.match(path) if not desc_m else None

                if desc_m:
                    section = desc_m.group(1)
                    idx = int(desc_m.group(2))
                    section_entries = result.get(section, [])
                    if idx < len(section_entries):
                        desc: list[str] = section_entries[idx].get("description", [])
                        if ctype == "modified" and hunk.original_text and hunk.proposed_text:
                            section_entries[idx]["description"] = [
                                hunk.original_text if b == hunk.proposed_text else b
                                for b in desc
                            ]
                        elif ctype == "added" and hunk.proposed_text:
                            section_entries[idx]["description"] = [
                                b for b in desc if b != hunk.proposed_text
                            ]
                        elif ctype == "removed" and hunk.original_text:
                            orig_entries = original_json.get(section, [])
                            if idx < len(orig_entries):
                                orig_desc = orig_entries[idx].get("description", [])
                                try:
                                    pos = orig_desc.index(hunk.original_text)
                                    desc.insert(min(pos, len(desc)), hunk.original_text)
                                except ValueError:
                                    desc.append(hunk.original_text)

                elif entry_m:
                    section = entry_m.group(1)
                    idx = int(entry_m.group(2))
                    section_entries = result.setdefault(section, [])
                    orig_entries = original_json.get(section, [])
                    if ctype == "modified":
                        if idx < len(section_entries) and idx < len(orig_entries):
                            section_entries[idx] = copy.deepcopy(orig_entries[idx])
                    elif ctype == "added":
                        if idx < len(section_entries):
                            section_entries.pop(idx)
                    elif ctype == "removed":
                        if idx < len(orig_entries):
                            section_entries.insert(idx, copy.deepcopy(orig_entries[idx]))

        except (IndexError, KeyError, TypeError, AttributeError):
            logger.warning(
                "Could not revert hunk %s path=%s change_type=%s",
                hunk.hunk_id, path, ctype,
            )

    return result


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


# ---------------------------------------------------------------------------
# Document chat  (multi-document: resume, CV, cover letter, outreach)
# ---------------------------------------------------------------------------

DOCUMENT_PERSONA = (
    "You are the Resume Matcher assistant. You speak in second person, never "
    "use the first person, and keep replies concise (1-4 short sentences). "
    "No hype, no emoji."
)

DOC_TYPE_LABELS = {
    "resume": "resume",
    "cv": "CV",
    "coverLetter": "cover letter",
    "outreach": "outreach message",
}


def _ground_in_text(
    doc_label: str,
    text: str,
    resume_title: str | None = None,
) -> str:
    title = resume_title or "(untitled)"
    return (
        f"You have full read access to the user's {doc_label} "
        f"(associated with a resume titled '{title}'). "
        f"Treat the text below as ground truth — do not invent content.\n\n"
        f"{doc_label.upper()}_TEXT:\n\"\"\"\n{text}\n\"\"\""
    )


def _text_edit_instructions(doc_label: str) -> str:
    return (
        f"The user wants you to edit their {doc_label}. "
        f"Produce the complete updated text incorporating the requested changes. "
        f"Preserve sections the user did not ask you to change.\n\n"
        f"Respond with strict JSON only — no markdown fences, no prose outside "
        f"the JSON:\n"
        '{\n'
        '  "reply": "1-3 sentence explanation of what you changed and why",\n'
        '  "edited_text": "...the complete updated document text..."\n'
        '}\n\n'
        "If you cannot safely produce the edit (e.g. the user is just "
        'chatting), return {"reply": "...", "edited_text": null}.'
    )


def _get_document_text(
    resume: dict[str, Any],
    document_type: str,
) -> str | None:
    """Extract the plain-text content for a text-based document type."""
    if document_type == "coverLetter":
        return resume.get("cover_letter")
    if document_type == "outreach":
        return resume.get("outreach_message")
    return None


@router.post("/document/{resume_id}", response_model=DocumentChatResponse)
async def chat_with_document(
    resume_id: str,
    request: DocumentChatRequest,
) -> DocumentChatResponse:
    """Chat turn scoped to a specific document type.

    For mode='discuss' the LLM gives a plain reply. For mode='edit' it
    produces changes that are diffed into per-hunk proposals the frontend
    can present one-at-a-time for approval.
    """
    resume = _get_resume_or_404(resume_id)
    title = resume.get("title") or resume.get("filename")
    doc_label = DOC_TYPE_LABELS.get(request.document_type, request.document_type)
    is_structured = request.document_type in ("resume", "cv")

    try:
        if is_structured:
            resume_json = _resume_json_payload(resume)
            grounding = _ground_in_resume(title, resume_json)
        else:
            doc_text = _get_document_text(resume, request.document_type)
            if not doc_text:
                return DocumentChatResponse(
                    reply=(
                        f"No {doc_label} exists yet. Generate one first, "
                        f"then come back to discuss or edit it."
                    ),
                )
            grounding = _ground_in_text(doc_label, doc_text, title)
            # Always include the underlying resume so the assistant has full context.
            try:
                resume_json = _resume_json_payload(resume)
                grounding += (
                    f"\n\nThe resume this {doc_label} was written from:\n\n"
                    f"RESUME_JSON:\n```json\n"
                    f"{json.dumps(resume_json, ensure_ascii=False)}\n```"
                )
            except HTTPException:
                pass

        # -- Discuss mode --
        if request.mode == "discuss":
            system_prompt = (
                f"{DOCUMENT_PERSONA} "
                f"Help the user understand and discuss their {doc_label}."
                f"\n\n{grounding}"
            )
            msgs = [
                {"role": m.role, "content": m.content}
                for m in request.messages
            ]
            reply = await chat_complete(
                messages=msgs,
                system_prompt=system_prompt,
                temperature=request.temperature,
                max_tokens=QA_MAX_TOKENS,
            )
            return DocumentChatResponse(reply=reply.strip())

        # -- Edit mode --
        if is_structured:
            system_prompt = (
                f"{DOCUMENT_PERSONA} "
                f"Help the user improve their {doc_label}."
                f"\n\n{grounding}\n\n{_proposal_instructions('edit')}"
            )
            msgs = [
                {"role": m.role, "content": m.content}
                for m in request.messages
            ]
            raw = await chat_complete(
                messages=msgs,
                system_prompt=system_prompt,
                temperature=request.temperature,
                max_tokens=PROPOSAL_MAX_TOKENS,
            )

            try:
                payload = json.loads(_extract_json_block(raw))
            except json.JSONDecodeError:
                logger.warning("Document chat: model returned non-JSON for structured edit")
                return DocumentChatResponse(
                    reply="Could not produce a clean edit. Try rephrasing.",
                )

            reply_text = str(payload.get("reply") or "").strip()
            proposed = payload.get("resume_json")
            if not isinstance(proposed, dict):
                return DocumentChatResponse(reply=reply_text or "Okay.")

            try:
                validated = ResumeData.model_validate(
                    normalize_resume_data(copy.deepcopy(proposed))
                ).model_dump(mode="json")
            except ValidationError:
                logger.warning("Document chat: proposed JSON failed validation")
                return DocumentChatResponse(
                    reply=reply_text or "The edit didn't match the schema. Try again.",
                )

            hunks = compute_resume_hunks(resume_json, validated)
            if not hunks:
                return DocumentChatResponse(
                    reply=reply_text or "No changes detected.",
                )

            backup = db.create_resume_json_backup(resume, source="document_chat")

            proposal_id = str(uuid.uuid4())
            _proposal_json_cache[proposal_id] = validated

            proposal = EditProposal(
                proposal_id=proposal_id,
                summary=str(payload.get("summary") or reply_text)[:120],
                hunks=hunks,
                snapshot_id=backup["backup_id"],
            )
            return DocumentChatResponse(reply=reply_text or proposal.summary, proposal=proposal)

        else:
            # Plain text edit (cover letter / outreach)
            doc_text = _get_document_text(resume, request.document_type) or ""
            system_prompt = (
                f"{DOCUMENT_PERSONA} "
                f"Help the user improve their {doc_label}."
                f"\n\n{grounding}\n\n{_text_edit_instructions(doc_label)}"
            )
            msgs = [
                {"role": m.role, "content": m.content}
                for m in request.messages
            ]
            raw = await chat_complete(
                messages=msgs,
                system_prompt=system_prompt,
                temperature=request.temperature,
                max_tokens=PROPOSAL_MAX_TOKENS,
            )

            try:
                payload = json.loads(_extract_json_block(raw))
            except json.JSONDecodeError:
                logger.warning("Document chat: model returned non-JSON for text edit")
                return DocumentChatResponse(
                    reply="Could not produce a clean edit. Try rephrasing.",
                )

            reply_text = str(payload.get("reply") or "").strip()
            edited = payload.get("edited_text")
            if not isinstance(edited, str) or not edited.strip():
                return DocumentChatResponse(reply=reply_text or "Okay.")

            hunks = compute_text_hunks(doc_text, edited.strip())
            if not hunks:
                return DocumentChatResponse(
                    reply=reply_text or "No changes detected.",
                )

            # Back up current text using the resume JSON backup mechanism
            backup = db.create_resume_json_backup(resume, source="document_chat")

            proposal = EditProposal(
                proposal_id=str(uuid.uuid4()),
                summary=reply_text[:120] if reply_text else "Proposed edits",
                hunks=hunks,
                snapshot_id=backup["backup_id"],
            )
            return DocumentChatResponse(reply=reply_text or proposal.summary, proposal=proposal)

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Document chat completion failed: {e}")
        raise HTTPException(
            status_code=502, detail="Assistant is unavailable. Try again."
        )
    except Exception as e:
        logger.error(f"Unexpected document chat error: {e}")
        raise HTTPException(
            status_code=500, detail="Chat request failed. Please try again."
        )


@router.post("/document/{resume_id}/apply", response_model=ApplyHunksResponse)
async def apply_document_hunks(
    resume_id: str,
    request: ApplyHunksRequest,
) -> ApplyHunksResponse:
    """Apply user-approved hunks from a document chat edit proposal."""
    resume = _get_resume_or_404(resume_id)
    is_structured = request.document_type in ("resume", "cv")

    verdict_map = {v.hunk_id: v.accepted for v in request.verdicts}
    accepted_hunks = [h for h in request.hunks if verdict_map.get(h.hunk_id, False)]
    rejected_count = len(request.hunks) - len(accepted_hunks)

    if not accepted_hunks:
        if is_structured:
            _proposal_json_cache.pop(request.proposal_id, None)
        return ApplyHunksResponse(applied_count=0, rejected_count=rejected_count)

    try:
        if is_structured:
            proposed_json = _proposal_json_cache.pop(request.proposal_id, None)
            if proposed_json is None:
                # Proposal expired (e.g. server restart) — cannot apply.
                raise HTTPException(
                    status_code=409,
                    detail="Proposal has expired. Generate a new edit proposal and try again.",
                )

            original_json = _resume_json_payload(resume)

            accepted_ids = {v.hunk_id for v in request.verdicts if v.accepted}
            rejected_hunks = [h for h in request.hunks if h.hunk_id not in accepted_ids]
            accepted_count = len(request.hunks) - len(rejected_hunks)

            if accepted_count == 0:
                return ApplyHunksResponse(applied_count=0, rejected_count=len(request.hunks))

            result = (
                _revert_hunks_in_proposed(original_json, proposed_json, rejected_hunks)
                if rejected_hunks
                else proposed_json
            )

            try:
                validated = ResumeData.model_validate(
                    normalize_resume_data(copy.deepcopy(result))
                ).model_dump(mode="json")
            except ValidationError:
                raise HTTPException(
                    status_code=422,
                    detail="Applied changes produced invalid resume data.",
                )

            db.update_resume(resume_id, {
                "processed_data": validated,
                "content": json.dumps(validated),
                "content_type": "json",
            })

            return ApplyHunksResponse(
                applied_count=accepted_count,
                rejected_count=len(rejected_hunks),
            )

        else:
            # Text document (cover letter / outreach)
            field = (
                "cover_letter"
                if request.document_type == "coverLetter"
                else "outreach_message"
            )
            current_text = resume.get(field) or ""

            # Rebuild the text by applying accepted hunks.
            # Each hunk has original_text / proposed_text; we do a simple
            # search-and-replace on the original text for each accepted hunk.
            result_text = current_text
            for hunk in reversed(accepted_hunks):
                if hunk.original_text:
                    result_text = result_text.replace(
                        hunk.original_text, hunk.proposed_text, 1
                    )
                elif hunk.proposed_text:
                    result_text = result_text + "\n" + hunk.proposed_text

            db.update_resume(resume_id, {field: result_text})

            return ApplyHunksResponse(
                applied_count=len(accepted_hunks),
                rejected_count=rejected_count,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to apply document hunks: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to apply changes. Please try again.",
        )


