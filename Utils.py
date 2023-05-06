from pypdf import PdfReader
from uuid import uuid4
import re


def extract_text_from_pdf(pdf_name: str) -> str:
    """
    Takes in the name of the pdf file to read from. Returns the text from it.
    If file is not found, returns empty string.  
    """
    if (pdf_name):
        reader = PdfReader(pdf_name)
        page = reader.pages[0]
        return page.extract_text()
    else:
        return ""


def generate_unique_id():
    """
    Generates a unique id and returns it as a string. [TEMPORARY UNTIL DATABASE IS CREATED]
    """
    return str(uuid4())


def clean_string(text):
    # Remove emails
    text = re.sub(r'\S+@\S+', '', text)
    # Remove links
    text = re.sub(r'http\S+', '', text)
    # Remove new lines
    text = text.replace('\n', ' ')
    # remote phone numbers
    text = re.sub(
        r'^(\+\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$', '', text)
    phone_pattern = r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
    text = re.sub(phone_pattern, '', text)
    return text
