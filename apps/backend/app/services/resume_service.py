import json
import re
import logging
from typing import Dict, Any, Optional
from uuid import uuid4
from io import BytesIO
import docx2txt
import PyPDF2

logger = logging.getLogger(__name__)


class ResumeService:
    """Service for handling resume operations with robust error handling."""
    
    def __init__(self, db_session=None):
        self.logger = logging.getLogger(__name__)
        self.db_session = db_session

    async def convert_and_store_resume(self, file_bytes: bytes, file_type: str, filename: str, content_type: str = "md") -> str:
        """
        Convert and store a resume file.
        
        Args:
            file_bytes: Raw file content
            file_type: MIME type of the file
            filename: Original filename
            content_type: Target content type (md/html)
            
        Returns:
            resume_id: ID of the stored resume
        """
        try:
            # Extract text from the file
            resume_text = self._extract_text(file_bytes, filename)
            
            # Generate a unique ID for the resume
            resume_id = str(uuid4())
            
            # TODO: Save to database
            # This is a placeholder - implement actual database storage
            
            return resume_id
            
        except Exception as e:
            self.logger.error(f"Failed to convert and store resume: {str(e)}")
            raise
    
    def _extract_text(self, content: bytes, filename: str) -> str:
        """Extract text from file content."""
        try:
            if filename.lower().endswith('.pdf'):
                # Handle PDF files
                pdf_file = BytesIO(content)
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text
                
            elif filename.lower().endswith(('.docx', '.doc')):
                # Handle Word documents
                doc_file = BytesIO(content)
                text = docx2txt.process(doc_file)
                return text
                
            else:
                raise ValueError(f"Unsupported file type: {filename}")
                
        except Exception as e:
            self.logger.error(f"Error extracting text from {filename}: {str(e)}")
            raise
    
    @staticmethod
    def clean_json_string(json_str: str) -> str:
        """
        Clean malformed JSON by removing trailing commas and fixing common issues.
        
        Args:
            json_str: The JSON string to clean
            
        Returns:
            Cleaned JSON string
        """
        # Remove trailing commas before closing brackets/braces
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
        
        # Remove comments (sometimes LLMs add these)
        json_str = re.sub(r'//.*?\n', '\n', json_str)
        json_str = re.sub(r'/\*.*?\*/', '', json_str, flags=re.DOTALL)
        
        return json_str.strip()
    
    @staticmethod
    def parse_llm_json_response(response_text: str) -> Dict[str, Any]:
        """
        Parse JSON from LLM response with error recovery.
        
        Args:
            response_text: Raw response text from LLM
            
        Returns:
            Parsed JSON dict
            
        Raises:
            ValueError: If JSON cannot be parsed even after cleaning
        """
        try:
            # First attempt: direct parsing
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON parse failed: {e}. Attempting to clean JSON...")
            
            try:
                # Second attempt: clean and parse
                cleaned = ResumeService.clean_json_string(response_text)
                return json.loads(cleaned)
            except json.JSONDecodeError as e2:
                logger.error(f"JSON parse failed even after cleaning: {e2}")
                logger.error(f"Problematic JSON section: {response_text[max(0, e2.pos-50):min(len(response_text), e2.pos+50)]}")
                
                # Third attempt: try to extract JSON from markdown code blocks
                json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
                if json_match:
                    try:
                        return json.loads(json_match.group(1))
                    except json.JSONDecodeError:
                        pass
                
                # Final attempt: look for any JSON-like structure
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    try:
                        cleaned = ResumeService.clean_json_string(json_match.group(0))
                        return json.loads(cleaned)
                    except json.JSONDecodeError:
                        pass
                
                raise ValueError(f"Failed to parse JSON response: {str(e2)}")
    
    @staticmethod
    def validate_and_sanitize_resume_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and sanitize resume data with lenient rules.
        
        Args:
            data: Raw resume data dict
            
        Returns:
            Sanitized resume data dict
        """
        sanitized = {}
        
        # Handle personal_data
        if 'personal_data' in data:
            personal = data['personal_data']
            sanitized['personal_data'] = {
                'name': str(personal.get('name', '')),
                'email': str(personal.get('email', '')),
                'phone': str(personal.get('phone', '')),
            }
            
            # Handle location - make it flexible
            if 'location' in personal:
                location = personal['location']
                if isinstance(location, str):
                    # If location is a string, use it as city
                    sanitized['personal_data']['location'] = {
                        'city': location,
                        'country': ''
                    }
                elif isinstance(location, dict):
                    sanitized['personal_data']['location'] = {
                        'city': str(location.get('city', '')),
                        'country': str(location.get('country', ''))
                    }
            else:
                sanitized['personal_data']['location'] = {'city': '', 'country': ''}
        
        # Handle experiences - make location optional
        if 'experiences' in data:
            sanitized['experiences'] = []
            for exp in data['experiences']:
                sanitized_exp = {
                    'company': str(exp.get('company', '')),
                    'position': str(exp.get('position', '')),
                    'start_date': str(exp.get('start_date', '')),
                    'end_date': str(exp.get('end_date', 'Present')),
                }
                
                # Handle location flexibly
                location = exp.get('location', '')
                if isinstance(location, str):
                    sanitized_exp['location'] = location
                elif isinstance(location, dict):
                    sanitized_exp['location'] = location.get('city', '')
                else:
                    sanitized_exp['location'] = ''
                
                # Handle description - remove trailing commas
                description = exp.get('description', [])
                if isinstance(description, list):
                    # Clean each description item and remove empty ones
                    sanitized_exp['description'] = [
                        str(item).strip().rstrip(',') 
                        for item in description 
                        if item and str(item).strip()
                    ]
                else:
                    sanitized_exp['description'] = [str(description)] if description else []
                
                sanitized['experiences'].append(sanitized_exp)
        
        # Handle education
        if 'education' in data:
            sanitized['education'] = []
            for edu in data['education']:
                sanitized['education'].append({
                    'institution': str(edu.get('institution', '')),
                    'degree': str(edu.get('degree', '')),
                    'field': str(edu.get('field', '')),
                    'graduation_date': str(edu.get('graduation_date', '')),
                })
        
        # Handle skills
        if 'skills' in data:
            skills = data['skills']
            if isinstance(skills, list):
                sanitized['skills'] = [str(skill).strip() for skill in skills if skill]
            elif isinstance(skills, dict):
                sanitized['skills'] = skills
            else:
                sanitized['skills'] = []
        
        # Copy other fields as-is
        for key in ['summary', 'projects', 'certifications', 'languages']:
            if key in data:
                sanitized[key] = data[key]
        
        return sanitized
    
    async def process_resume(
        self, 
        file_content: bytes, 
        filename: str,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process uploaded resume file.
        
        Args:
            file_content: Raw file bytes
            filename: Name of the file
            user_id: Optional user ID
            
        Returns:
            Processed resume data
        """
        try:
            # Extract text from file
            resume_text = self._extract_text(file_content, filename)
            
            # Call LLM to structure the resume
            llm_response = await self._call_llm(resume_text)
            
            # Parse and sanitize
            structured_data = self.parse_llm_json_response(llm_response)
            sanitized_data = self.validate_and_sanitize_resume_data(structured_data)
            
            # Store in database (implement your storage logic)
            resume_id = await self._store_resume(sanitized_data, user_id)
            
            return {
                'resume_id': resume_id,
                'data': sanitized_data
            }
            
        except Exception as e:
            self.logger.error(f"Error processing resume: {str(e)}", exc_info=True)
            raise
    
    def _extract_text(self, content: bytes, filename: str) -> str:
        """Extract text from file content."""
        # TODO: Implement your text extraction logic
        # This should handle PDF, DOCX, etc.
        pass
    
    async def _call_llm(self, text: str) -> str:
        """Call LLM to structure resume."""
        # TODO: Implement your LLM call logic
        pass
    
    async def _store_resume(self, data: dict, user_id: Optional[str]) -> str:
        """Store resume in database."""
        # TODO: Implement your database storage logic
        pass


# For backwards compatibility, if needed
def parse_llm_json_response(response_text: str) -> Dict[str, Any]:
    """Standalone function wrapper for parsing LLM JSON responses."""
    return ResumeService.parse_llm_json_response(response_text)


def validate_and_sanitize_resume_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Standalone function wrapper for validating resume data."""
    return ResumeService.validate_and_sanitize_resume_data(data)