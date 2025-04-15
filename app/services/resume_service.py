from io import BytesIO
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
import html2text
from app.models import Resume

class ResumeService:
    """
    A service class for handling resume-related operations.
    """
    def __init__(self, db_session):
        """
        Initialize the ResumeService with a database session.
        Args:
            db_session (Session): The database session to be used.
        """
        self.db = db_session


    def convert_and_pdf_to_md(self, pdf_bytes: bytes, content_type='md') -> str:
        """
        Convert PDF bytes to md using pdfminer and html2text.
        
        Args:
            pdf_bytes (bytes): The PDF file content in bytes.
            
        Returns:
            str: The converted md content.
        """
        output = BytesIO()
        laparams = LAParams()

        extract_text_to_fp(BytesIO(pdf_bytes), output, laparams=laparams, output_type='hmtl', codec='utf-8')
        html_content = output.getvalue().decode('utf-8')
        if content_type == 'html':
            return html_content
        
        converter = html2text.HTML2Text()
        converter.ignore_links = False
        converter.ignore_images = False
        converter.body_width = 0

        md_content = converter.handle(html_content)
        
        return md_content, content_type
    
    def store_resume(self, resume_id: str, content: str, content_type: str = "md") -> Resume:
        """
        Store the resume content in the database.
        
        Args:
            content (str): The resume content to be stored.
            
        Returns:
            Resume: The created Resume object.
        """
        resume = Resume(resume_id=resume_id, content=content, content_type=content_type)
        self.db.add(resume)
        self.db.commit()
        self.db.refresh(resume)
        
        return resume
    
    def convert_and_store_resume(self, pdf_bytes: bytes, resume_id: str,content_type: str = "md") -> Resume:
        """
        Convert PDF bytes to md and store it in the database.
        
        Args:
            pdf_bytes (bytes): The PDF file content in bytes.
            
        Returns:
            Resume: The created Resume object.
        """
        md_content, content_type = self.convert_and_pdf_to_md(pdf_bytes, content_type)
        
        return self.store_resume(resume_id, md_content, content_type)