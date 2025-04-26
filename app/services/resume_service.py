import os
import uuid
import json
import tempfile
import logging

from markitdown import MarkItDown
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import ValidationError

from app.models import Resume, ProcessedResume
from app.agent import AgentManager
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import StructuredResumeModel

logger = logging.getLogger(__name__)


class ResumeService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.md = MarkItDown(enable_plugins=False)
        self.json_agent_manager = AgentManager(model="gemma3:4b")

    async def convert_and_store_resume(
        self, file_bytes: bytes, file_type: str, filename: str, content_type: str = "md"
    ):
        """
        Converts resume file (PDF/DOCX) to text using MarkItDown and stores it in the database.

        Args:
            file_bytes: Raw bytes of the uploaded file
            file_type: MIME type of the file ("application/pdf" or "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            filename: Original filename
            content_type: Output format ("md" for markdown or "html")

        Returns:
            None
        """
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=self._get_file_extension(file_type)
        ) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        try:
            result = self.md.convert(temp_path)
            text_content = result.text_content
            resume_id = await self._store_resume_in_db(text_content, content_type)

            await self._extract_and_store_structured_resume(
                resume_id=resume_id, resume_text=text_content
            )

            return resume_id
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _get_file_extension(self, file_type: str) -> str:
        """Returns the appropriate file extension based on MIME type"""
        if file_type == "application/pdf":
            return ".pdf"
        elif (
            file_type
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            return ".docx"
        return ""

    async def _store_resume_in_db(self, text_content: str, content_type: str):
        """
        Stores the parsed resume content in the database.
        """
        resume_id = str(uuid.uuid4())
        resume = Resume(
            resume_id=resume_id, content=text_content, content_type=content_type
        )

        self.db.add(resume)
        await self.db.flush()
        await self.db.commit()

        return resume_id

    async def _extract_and_store_structured_resume(
        self, resume_id, resume_text: str
    ) -> None:
        """
        extract and store structured resume data in the database
        """
        structured_resume = await self._extract_structured_json(resume_text)
        if not structured_resume:
            logger.info("Structured resume extraction failed.")
            return None

        processed_resume = ProcessedResume(
            resume_id=resume_id,
            personal_data=json.dumps(structured_resume.get("personal_data", {}))
            if structured_resume.get("personal_data")
            else None,
            experiences=json.dumps(
                {"experiences": structured_resume.get("experiences", [])}
            )
            if structured_resume.get("experiences")
            else None,
            projects=json.dumps({"projects": structured_resume.get("projects", [])})
            if structured_resume.get("projects")
            else None,
            skills=json.dumps({"skills": structured_resume.get("skills", [])})
            if structured_resume.get("skills")
            else None,
            research_work=json.dumps(
                {"research_work": structured_resume.get("research_work", [])}
            )
            if structured_resume.get("research_work")
            else None,
            achievements=json.dumps(
                {"achievements": structured_resume.get("achievements", [])}
            )
            if structured_resume.get("achievements")
            else None,
            education=json.dumps({"education": structured_resume.get("education", [])})
            if structured_resume.get("education")
            else None,
            extracted_keywords=json.dumps(
                {"extracted_keywords": structured_resume.get("extracted_keywords", [])}
                if structured_resume.get("extracted_keywords")
                else None
            ),
        )

        self.db.add(processed_resume)
        await self.db.commit()

    async def _extract_structured_json(
        self, resume_text: str
    ) -> StructuredResumeModel | None:
        """
        Uses the AgentManager+JSONWrapper to ask the LLM to
        return the data in exact JSON schema we need.
        """
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("structured_resume"), indent=2),
            resume_text,
        )
        logger.info(f"Structured Resume Prompt: {prompt}")
        raw_output = await self.json_agent_manager.run(prompt=prompt)

        try:
            structured_resume: StructuredResumeModel = (
                StructuredResumeModel.model_validate(raw_output)
            )
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            return None
        return structured_resume.model_dump()
