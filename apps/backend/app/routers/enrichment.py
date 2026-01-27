"""AI-powered resume enrichment endpoints."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import db
from app.llm import complete_json
from app.prompts.enrichment import ANALYZE_RESUME_PROMPT, ENHANCE_DESCRIPTION_PROMPT
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
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrichment", tags=["Enrichment"])


def _get_content_language() -> str:
    """Get content language from stored config."""
    config_path = settings.config_path
    try:
        if config_path.exists():
            config = json.loads(config_path.read_text())
            # Use content_language, fall back to legacy 'language' field, then default to 'en'
            return config.get("content_language", config.get("language", "en"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning(f"Failed to read content language from config: {e}")
    return "en"


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
    resume_json = json.dumps(processed_data, indent=2)
    language = _get_content_language()
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

    # Group answers by item_id (extract from question_id pattern)
    # Question IDs are like "q_0", "q_1", etc. but we need to know which item each belongs to
    # First, we need to re-analyze to get the mapping, or we need the items passed in
    # For simplicity, we'll call analyze again to get the question-to-item mapping

    # Actually, let's parse the answers differently - the frontend should include item context
    # For now, we'll get the analysis to build the mapping
    resume_json = json.dumps(processed_data, indent=2)
    language = _get_content_language()
    output_language = get_language_name(language)
    analysis_prompt = ANALYZE_RESUME_PROMPT.format(
        resume_json=resume_json,
        output_language=output_language
    )

    try:
        analysis_result = await complete_json(analysis_prompt, max_tokens=8192)
    except Exception as e:
        logger.error(f"Failed to re-analyze resume: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process enhancements. Please try again.",
        )

    # Build question_id -> item_id mapping
    question_to_item: dict[str, str] = {}
    for q in analysis_result.get("questions", []):
        question_to_item[q.get("question_id", "")] = q.get("item_id", "")

    # Build item details mapping
    item_details: dict[str, dict] = {}
    for item in analysis_result.get("items_to_enrich", []):
        item_id = item.get("item_id", "")
        item_details[item_id] = item

    # Group answers by item_id
    answers_by_item: dict[str, list[AnswerInput]] = {}
    for answer in request.answers:
        item_id = question_to_item.get(answer.question_id, "")
        if item_id:
            if item_id not in answers_by_item:
                answers_by_item[item_id] = []
            answers_by_item[item_id].append(answer)

    # Generate enhanced descriptions for each item
    enhancements: list[EnhancedDescription] = []

    for item_id, answers in answers_by_item.items():
        item = item_details.get(item_id, {})
        if not item:
            continue

        # Find the original questions to include context
        item_questions = [
            q for q in analysis_result.get("questions", []) if q.get("item_id") == item_id
        ]

        # Format answers with their questions for context
        answers_text = ""
        for answer in answers:
            # Find matching question
            matching_q = next(
                (q for q in item_questions if q.get("question_id") == answer.question_id),
                None,
            )
            if matching_q:
                answers_text += f"Q: {matching_q.get('question', '')}\n"
                answers_text += f"A: {answer.answer}\n\n"
            else:
                answers_text += f"Additional info: {answer.answer}\n\n"

        # Build enhancement prompt with content language
        current_desc = item.get("current_description", [])
        current_desc_text = "\n".join(f"- {d}" for d in current_desc) if current_desc else "(No description)"
        
        language = _get_content_language()
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
    updated_data = dict(processed_data)

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
