"""AI-powered resume enrichment endpoints."""

import asyncio
import copy
import json
import logging
import re
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.config_cache import get_content_language
from app.database import db
from app.llm import complete_json
from app.prompts.enrichment import (
    ANALYZE_RESUME_PROMPT,
    ENHANCE_DESCRIPTION_PROMPT,
    REGENERATE_ITEM_PROMPT,
    REGENERATE_SKILLS_PROMPT,
)
from app.prompts.templates import get_language_name
from app.schemas.enrichment import (
    AnalysisResponse,
    AnswerInput,
    ApplyEnhancementsRequest,
    EnhancedDescription,
    EnhanceRequest,
    EnhancementPreview,
    EnrichmentItem,
    EnrichmentQuestion,
    RegenerateItemError,
    RegenerateItemInput,
    RegenerateRequest,
    RegenerateResponse,
    RegeneratedItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrichment", tags=["Enrichment"])


def _extract_item_from_resume(processed_data: dict, item_id: str) -> dict:
    """Derive item details from resume data using the item_id pattern.

    Avoids a redundant LLM analysis call when the frontend already knows
    which item each answer belongs to.
    """
    try:
        prefix, idx_str = item_id.split("_", 1)
        index = int(idx_str)
    except (ValueError, AttributeError):
        return {}

    if index < 0:
        return {}

    if prefix == "exp":
        entries = processed_data.get("workExperience", [])
        if not isinstance(entries, list) or index >= len(entries):
            return {}
        entry = entries[index]
        desc = entry.get("description", [])
        return {
            "item_id": item_id,
            "item_type": "experience",
            "title": entry.get("title", ""),
            "subtitle": entry.get("company", ""),
            "current_description": desc if isinstance(desc, list) else [desc] if isinstance(desc, str) and desc else [],
        }
    elif prefix == "proj":
        entries = processed_data.get("personalProjects", [])
        if not isinstance(entries, list) or index >= len(entries):
            return {}
        entry = entries[index]
        desc = entry.get("description", [])
        return {
            "item_id": item_id,
            "item_type": "project",
            "title": entry.get("name", ""),
            "subtitle": entry.get("role", ""),
            "current_description": desc if isinstance(desc, list) else [desc] if isinstance(desc, str) and desc else [],
        }
    return {}


@router.post("/analyze/{resume_id}", response_model=AnalysisResponse)
async def analyze_resume(resume_id: str) -> AnalysisResponse:
    """Analyze a resume to identify items that need enrichment.

    Uses AI to examine Experience and Projects sections for weak,
    vague, or incomplete descriptions and generates clarifying questions.
    """
    # Fetch resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Get processed data
    processed_data = resume.get("processed_data")
    if not processed_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Build prompt with content language
    resume_json = json.dumps(processed_data)
    language = get_content_language()
    output_language = get_language_name(language)
    prompt = ANALYZE_RESUME_PROMPT.format(
        resume_json=resume_json,
        output_language=output_language
    )

    try:
        # Call LLM with increased max_tokens for non-English languages
        result = await complete_json(prompt, max_tokens=8192)

        # Parse response into schema objects
        items_to_enrich = [
            EnrichmentItem(
                item_id=item.get("item_id", f"item_{i}"),
                item_type=item.get("item_type", "experience"),
                title=item.get("title", ""),
                subtitle=item.get("subtitle"),
                current_description=item.get("current_description", []),
                weakness_reason=item.get("weakness_reason", ""),
            )
            for i, item in enumerate(result.get("items_to_enrich", []))
        ]

        questions = [
            EnrichmentQuestion(
                question_id=q.get("question_id", f"q_{i}"),
                item_id=q.get("item_id", ""),
                question=q.get("question", ""),
                placeholder=q.get("placeholder", ""),
            )
            for i, q in enumerate(result.get("questions", []))
        ]

        return AnalysisResponse(
            items_to_enrich=items_to_enrich,
            questions=questions,
            analysis_summary=result.get("analysis_summary"),
        )

    except Exception as e:
        logger.error(f"Resume analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze resume. Please try again.",
        )


@router.post("/enhance", response_model=EnhancementPreview)
async def generate_enhancements(request: EnhanceRequest) -> EnhancementPreview:
    """Generate enhanced descriptions from user answers.

    Takes the answers to clarifying questions and uses AI to generate
    improved description bullets for each item.
    """
    # Fetch resume
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    processed_data = resume.get("processed_data")
    if not processed_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data.",
        )

    # Group answers by item_id.
    # When all answers carry item_id (from the analysis step), we can skip
    # the expensive re-analysis LLM call and derive item details from the
    # resume's processed_data directly.
    answers_by_item: dict[str, list[AnswerInput]] = {}
    item_details: dict[str, dict] = {}
    # question_id → question dict, populated only in the legacy path
    questions_by_id: dict[str, dict] = {}

    if all(a.item_id for a in request.answers) and all(
        _extract_item_from_resume(processed_data, a.item_id or "")
        for a in request.answers
    ):
        # Fast path — no re-analysis needed
        for answer in request.answers:
            item_id = answer.item_id or ""
            answers_by_item.setdefault(item_id, []).append(answer)
            if item_id not in item_details:
                item_details[item_id] = _extract_item_from_resume(
                    processed_data, item_id
                )
    else:
        # Legacy path — re-analyze to get question-to-item mapping
        resume_json = json.dumps(processed_data)
        language = get_content_language()
        output_language = get_language_name(language)
        analysis_prompt = ANALYZE_RESUME_PROMPT.format(
            resume_json=resume_json,
            output_language=output_language,
        )

        try:
            analysis_result = await complete_json(analysis_prompt, max_tokens=8192)
        except Exception as e:
            logger.error(f"Failed to re-analyze resume: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to process enhancements. Please try again.",
            )

        question_to_item: dict[str, str] = {}
        for q in analysis_result.get("questions", []):
            qid = q.get("question_id", "")
            question_to_item[qid] = q.get("item_id", "")
            questions_by_id[qid] = q

        for item in analysis_result.get("items_to_enrich", []):
            item_id = item.get("item_id", "")
            item_details[item_id] = item

        for answer in request.answers:
            item_id = question_to_item.get(answer.question_id, "")
            if item_id:
                answers_by_item.setdefault(item_id, []).append(answer)

    # Generate enhanced descriptions for each item
    enhancements: list[EnhancedDescription] = []

    for item_id, answers in answers_by_item.items():
        item = item_details.get(item_id, {})
        if not item:
            continue

        # Format answers with their questions for context.
        # In the fast path questions_by_id is empty, so fall back to
        # question_text carried on the AnswerInput itself.
        answers_text = ""
        for answer in answers:
            matching_q = questions_by_id.get(answer.question_id)
            question = (
                matching_q.get("question", "") if matching_q else answer.question_text
            )
            if question:
                answers_text += f"Q: {question}\n"
                answers_text += f"A: {answer.answer}\n\n"
            else:
                answers_text += f"Additional info: {answer.answer}\n\n"

        # Build enhancement prompt with content language
        current_desc = item.get("current_description", [])
        current_desc_text = "\n".join(f"- {d}" for d in current_desc) if current_desc else "(No description)"
        
        language = get_content_language()
        output_language = get_language_name(language)

        prompt = ENHANCE_DESCRIPTION_PROMPT.format(
            item_type=item.get("item_type", "experience"),
            title=item.get("title", ""),
            subtitle=item.get("subtitle", ""),
            current_description=current_desc_text,
            answers=answers_text.strip(),
            output_language=output_language,
        )

        try:
            result = await complete_json(prompt)
            # Get additional bullets from LLM (new key name)
            additional_bullets = result.get("additional_bullets", [])
            # Fallback to old key for backwards compatibility
            if not additional_bullets:
                additional_bullets = result.get("enhanced_description", [])
            # Guard against non-list returns from LLM
            if not isinstance(additional_bullets, list):
                additional_bullets = []
            additional_bullets = [str(b) for b in additional_bullets if b]

            enhancements.append(
                EnhancedDescription(
                    item_id=item_id,
                    item_type=item.get("item_type", "experience"),
                    title=item.get("title", ""),
                    original_description=current_desc,
                    enhanced_description=additional_bullets,  # These are NEW bullets to add
                )
            )
        except Exception as e:
            logger.warning(f"Failed to enhance item {item_id}: {e}")
            # Continue with other items

    return EnhancementPreview(enhancements=enhancements)


@router.post("/apply/{resume_id}")
async def apply_enhancements(
    resume_id: str, request: ApplyEnhancementsRequest
) -> dict:
    """Apply enhancements to the master resume.

    Updates the resume's Experience and Projects sections with
    the enhanced descriptions.
    """
    # Fetch resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    processed_data = resume.get("processed_data")
    if not processed_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data.",
        )

    # Make a copy to modify
    updated_data = copy.deepcopy(processed_data)

    # Apply each enhancement by ADDING new bullets to existing description
    for enhancement in request.enhancements:
        item_id = enhancement.item_id
        item_type = enhancement.item_type
        additional_bullets = enhancement.enhanced_description  # These are NEW bullets to add

        if item_type == "experience":
            # Parse item_id like "exp_0" to get index
            try:
                index = int(item_id.split("_")[1])
                if "workExperience" in updated_data and index < len(updated_data["workExperience"]):
                    # Get existing description and ADD new bullets
                    existing_desc = updated_data["workExperience"][index].get("description", [])
                    if isinstance(existing_desc, list):
                        updated_data["workExperience"][index]["description"] = existing_desc + additional_bullets
                    else:
                        # Handle edge case where description might be a string
                        updated_data["workExperience"][index]["description"] = [existing_desc] + additional_bullets if existing_desc else additional_bullets
            except (ValueError, IndexError) as e:
                logger.warning(f"Could not apply experience enhancement for {item_id}: {e}")

        elif item_type == "project":
            # Parse item_id like "proj_0" to get index
            try:
                index = int(item_id.split("_")[1])
                if "personalProjects" in updated_data and index < len(updated_data["personalProjects"]):
                    # Get existing description and ADD new bullets
                    existing_desc = updated_data["personalProjects"][index].get("description", [])
                    if isinstance(existing_desc, list):
                        updated_data["personalProjects"][index]["description"] = existing_desc + additional_bullets
                    else:
                        # Handle edge case where description might be a string
                        updated_data["personalProjects"][index]["description"] = [existing_desc] + additional_bullets if existing_desc else additional_bullets
            except (ValueError, IndexError) as e:
                logger.warning(f"Could not apply project enhancement for {item_id}: {e}")

    # Update the resume in database
    updated_content = json.dumps(updated_data, indent=2)
    try:
        db.update_resume(
            resume_id,
            {
                "content": updated_content,
                "processed_data": updated_data,
            },
        )
    except Exception as e:
        logger.error(f"Failed to save enhancements to database: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save enhancements. Please try again.",
        )

    return {
        "message": "Enhancements applied successfully",
        "updated_items": len(request.enhancements),
    }


# ============================================
# AI Regenerate Feature Endpoints
# ============================================


async def _regenerate_experience_or_project(
    item: RegenerateItemInput,
    instruction: str,
    output_language: str,
) -> RegeneratedItem:
    """Regenerate a single experience or project item."""
    current_desc_text = (
        "\n".join(f"- {d}" for d in item.current_content)
        if item.current_content
        else "(No description)"
    )

    prompt = REGENERATE_ITEM_PROMPT.format(
        output_language=output_language,
        item_type=item.item_type,
        title=item.title,
        subtitle=item.subtitle or "",
        current_description=current_desc_text,
        user_instruction=instruction,
    )

    result = await complete_json(prompt, max_tokens=4096)

    new_bullets = result.get("new_bullets", [])
    if not isinstance(new_bullets, list):
        new_bullets = []
    new_bullets = [str(b) for b in new_bullets if b]

    return RegeneratedItem(
        item_id=item.item_id,
        item_type=item.item_type,
        title=item.title,
        subtitle=item.subtitle,
        original_content=item.current_content,
        new_content=new_bullets,
        diff_summary=str(result.get("change_summary") or ""),
    )


async def _regenerate_skills(
    item: RegenerateItemInput,
    instruction: str,
    output_language: str,
) -> RegeneratedItem:
    """Regenerate the skills section."""
    current_skills_text = ", ".join(item.current_content) if item.current_content else "(No skills)"

    prompt = REGENERATE_SKILLS_PROMPT.format(
        output_language=output_language,
        current_skills=current_skills_text,
        user_instruction=instruction,
    )

    result = await complete_json(prompt, max_tokens=2048)

    new_skills = result.get("new_skills", [])
    if not isinstance(new_skills, list):
        new_skills = []
    new_skills = [str(s) for s in new_skills if s]

    return RegeneratedItem(
        item_id=item.item_id,
        item_type=item.item_type,
        title=item.title,
        subtitle=item.subtitle,
        original_content=item.current_content,
        new_content=new_skills,
        diff_summary=str(result.get("change_summary") or ""),
    )


@router.post("/regenerate", response_model=RegenerateResponse)
async def regenerate_items(request: RegenerateRequest) -> RegenerateResponse:
    """Regenerate selected resume items based on user feedback.

    Takes selected items (experience, projects, skills) and a user instruction,
    then uses AI to rewrite the content addressing the user's concerns.
    """
    # Validate resume exists
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if not request.items:
        raise HTTPException(status_code=400, detail="No items selected for regeneration")

    # Get language name for LLM
    output_language = get_language_name(request.output_language)

    # Process all items in parallel for better performance
    tasks = []
    for item in request.items:
        if item.item_type == "skills":
            tasks.append(_regenerate_skills(item, request.instruction, output_language))
        else:
            tasks.append(_regenerate_experience_or_project(item, request.instruction, output_language))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    regenerated_items: list[RegeneratedItem] = []
    errors: list[RegenerateItemError] = []

    for item, result in zip(request.items, results):
        if isinstance(result, Exception):
            logger.error(
                "Failed to regenerate item. "
                f"resume_id={request.resume_id} item_id={item.item_id} item_type={item.item_type}",
                exc_info=result,
            )
            errors.append(
                RegenerateItemError(
                    item_id=item.item_id,
                    item_type=item.item_type,
                    title=item.title,
                    subtitle=item.subtitle,
                    message="Failed to regenerate this item. Please try again.",
                )
            )
            continue

        regenerated_items.append(result)

    if not regenerated_items:
        raise HTTPException(
            status_code=500,
            detail="Failed to regenerate content. Please try again.",
        )

    return RegenerateResponse(regenerated_items=regenerated_items, errors=errors)


@router.post("/apply-regenerated/{resume_id}")
async def apply_regenerated_items(
    resume_id: str, regenerated_items: list[RegeneratedItem]
) -> dict:
    """Apply regenerated items to the master resume.

    Updates the resume's Experience, Projects, and Skills sections with
    the regenerated descriptions.
    """
    # Fetch resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    processed_data = resume.get("processed_data")
    if not processed_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data.",
        )

    # Make a copy to modify
    updated_data = copy.deepcopy(processed_data)

    def _normalize_match_value(value: str | None) -> str:
        return (value or "").strip().casefold()

    def _normalize_lines(value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            normalized: list[str] = []
            for entry in value:
                text = str(entry).strip()
                if text:
                    normalized.append(text)
            return normalized
        text = str(value).strip()
        return [text] if text else []

    def _lines_equal(left: object, right: object) -> bool:
        left_norm = [line.casefold() for line in _normalize_lines(left)]
        right_norm = [line.casefold() for line in _normalize_lines(right)]
        return left_norm == right_norm

    def _find_unique_index_by_metadata(
        entries: list[dict],
        *,
        title_key: str,
        subtitle_key: str,
        expected_title: str,
        expected_subtitle: str | None,
        expected_original_content: list[str],
        content_key: str,
    ) -> int | None:
        expected_title_norm = _normalize_match_value(expected_title)
        expected_subtitle_norm = _normalize_match_value(expected_subtitle)

        if not expected_title_norm:
            return None

        matches: list[int] = []
        for i, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            entry_title = _normalize_match_value(str(entry.get(title_key, "")))
            entry_subtitle = _normalize_match_value(str(entry.get(subtitle_key, "")))

            if entry_title != expected_title_norm:
                continue
            if expected_subtitle_norm and entry_subtitle != expected_subtitle_norm:
                continue
            matches.append(i)

        if len(matches) == 1:
            return matches[0]

        # If metadata is ambiguous, try to disambiguate using the original content.
        matches_by_content = [
            i for i in matches if _lines_equal(entries[i].get(content_key), expected_original_content)
        ]
        if len(matches_by_content) == 1:
            return matches_by_content[0]

        return None

    def _parse_index(item_id: str, pattern: str) -> int | None:
        match = re.fullmatch(pattern, item_id)
        if not match:
            return None
        return int(match.group(1))

    apply_failures: list[str] = []

    # Apply each regenerated item (all-or-nothing to avoid corrupting user data)
    for item in regenerated_items:
        item_id = item.item_id
        item_type = item.item_type
        new_content = item.new_content

        if item_type == "experience":
            experiences = updated_data.get("workExperience", [])
            if not isinstance(experiences, list):
                apply_failures.append(item_id)
                continue

            index = _parse_index(item_id, r"exp_(\d+)")
            if index is None:
                apply_failures.append(item_id)
                continue

            expected_title = item.title
            expected_company = item.subtitle
            expected_original_content = item.original_content

            resolved_index: int | None = None
            if 0 <= index < len(experiences):
                entry = experiences[index] if isinstance(experiences[index], dict) else {}
                entry_title = _normalize_match_value(str(entry.get("title", "")))
                entry_company = _normalize_match_value(str(entry.get("company", "")))
                if entry_title == _normalize_match_value(expected_title) and (
                    not _normalize_match_value(expected_company)
                    or entry_company == _normalize_match_value(expected_company)
                ) and _lines_equal(entry.get("description"), expected_original_content):
                    resolved_index = index

            if resolved_index is None:
                resolved_index = _find_unique_index_by_metadata(
                    experiences,
                    title_key="title",
                    subtitle_key="company",
                    expected_title=expected_title,
                    expected_subtitle=expected_company,
                    expected_original_content=expected_original_content,
                    content_key="description",
                )

            if resolved_index is None:
                logger.warning(
                    "apply-regenerated: experience item mismatch; resume may have changed. "
                    f"resume_id={resume_id} item_id={item_id} expected_title={expected_title!r} "
                    f"expected_company={expected_company!r}"
                )
                apply_failures.append(item_id)
                continue

            entry = experiences[resolved_index]
            if isinstance(entry, dict):
                if not _lines_equal(entry.get("description"), expected_original_content):
                    apply_failures.append(item_id)
                    continue
                entry["description"] = new_content
            else:
                apply_failures.append(item_id)

        elif item_type == "project":
            projects = updated_data.get("personalProjects", [])
            if not isinstance(projects, list):
                apply_failures.append(item_id)
                continue

            index = _parse_index(item_id, r"proj_(\d+)")
            if index is None:
                apply_failures.append(item_id)
                continue

            expected_name = item.title
            expected_role = item.subtitle
            expected_original_content = item.original_content

            resolved_index = None
            if 0 <= index < len(projects):
                entry = projects[index] if isinstance(projects[index], dict) else {}
                entry_name = _normalize_match_value(str(entry.get("name", "")))
                entry_role = _normalize_match_value(str(entry.get("role", "")))
                if entry_name == _normalize_match_value(expected_name) and (
                    not _normalize_match_value(expected_role)
                    or entry_role == _normalize_match_value(expected_role)
                ) and _lines_equal(entry.get("description"), expected_original_content):
                    resolved_index = index

            if resolved_index is None:
                resolved_index = _find_unique_index_by_metadata(
                    projects,
                    title_key="name",
                    subtitle_key="role",
                    expected_title=expected_name,
                    expected_subtitle=expected_role,
                    expected_original_content=expected_original_content,
                    content_key="description",
                )

            if resolved_index is None:
                logger.warning(
                    "apply-regenerated: project item mismatch; resume may have changed. "
                    f"resume_id={resume_id} item_id={item_id} expected_name={expected_name!r} "
                    f"expected_role={expected_role!r}"
                )
                apply_failures.append(item_id)
                continue

            entry = projects[resolved_index]
            if isinstance(entry, dict):
                if not _lines_equal(entry.get("description"), expected_original_content):
                    apply_failures.append(item_id)
                    continue
                entry["description"] = new_content
            else:
                apply_failures.append(item_id)

        elif item_type == "skills":
            # Update technical skills (stored in additional.technicalSkills)
            expected_original_content = item.original_content

            additional = updated_data.get("additional")
            if isinstance(additional, dict) and "technicalSkills" in additional:
                if not _lines_equal(additional.get("technicalSkills"), expected_original_content):
                    apply_failures.append(item_id)
                    continue
                additional["technicalSkills"] = new_content
            elif "technicalSkills" in updated_data:
                # Fallback for legacy data structure
                if not _lines_equal(updated_data.get("technicalSkills"), expected_original_content):
                    apply_failures.append(item_id)
                    continue
                updated_data["technicalSkills"] = new_content
            else:
                apply_failures.append(item_id)

    if apply_failures:
        logger.warning(
            "apply-regenerated: refusing to apply due to mismatched/missing items. "
            f"resume_id={resume_id} item_ids={apply_failures}"
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "Resume content changed or could not be uniquely matched. "
                "Please regenerate and try again."
            ),
        )

    # Update the resume in database
    updated_content = json.dumps(updated_data, indent=2)
    try:
        db.update_resume(
            resume_id,
            {
                "content": updated_content,
                "processed_data": updated_data,
            },
        )
    except Exception as e:
        logger.error(f"Failed to save regenerated content to database: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save changes. Please try again.",
        )

    return {
        "message": "Changes applied successfully",
        "updated_items": len(regenerated_items),
    }
