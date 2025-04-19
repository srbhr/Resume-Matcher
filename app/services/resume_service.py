import tempfile
import os
import uuid
from markitdown import MarkItDown
from sqlalchemy.orm import Session
from app.models.resume import Resume


class ResumeService:
    def __init__(self, db: Session):
        self.db = db
        self.md = MarkItDown(enable_plugins=False)

    def convert_and_store_resume(
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
            resume_id = str(uuid.uuid4())
            self._store_resume_in_db(resume_id, filename, text_content, content_type)

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

    def _store_resume_in_db(
        self, resume_id: str, filename: str, text_content: str, content_type: str
    ):
        """
        Stores the parsed resume content in the database.
        """
        resume = Resume(
            resume_id=resume_id, content=text_content, content_type=content_type
        )

        self.db.add(resume)
        self.db.commit()

        return resume
