import os
import glob
from pypdf import PdfReader


def get_pdf_files(file_path):
    """
    Get all PDF files from the specified file path.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list containing the paths of all the PDF files in the directory.
    """
    if os.path.exists(file_path):
        return glob.glob(os.path.join(file_path, '*.pdf'))
    else:
        return []


def read_multiple_pdf(file_path: str) -> list:
    """
    Read multiple PDF files from the specified file path and extract the text from each page.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list containing the extracted text from each page of the PDF files.
    """
    pdf_files = get_pdf_files(file_path)
    output = []
    for file in pdf_files:
        try:
            with open(file, 'rb') as f:
                pdf_reader = PdfReader(f)
                count = pdf_reader.getNumPages()
                for i in range(count):
                    page = pdf_reader.getPage(i)
                    output.append(page.extractText())
        except Exception as e:
            print(f"Error reading file '{file}': {str(e)}")
    return output


def read_single_pdf(file_path: str) -> str:
    """
    Read a single PDF file and extract the text from each page.

    Args:
        file_path (str): The path of the PDF file.

    Returns:
        list: A list containing the extracted text from each page of the PDF file.
    """
    output = []
    try:
        with open(file_path, 'rb') as f:
            pdf_reader = PdfReader(f)
            count = len(pdf_reader.pages)
            for i in range(count):
                page = pdf_reader.pages[i]
                output.append(page.extract_text())
    except Exception as e:
        print(f"Error reading file '{file_path}': {str(e)}")
    return str(" ".join(output))


def get_pdf_files(file_path: str) -> list:
    """
    Get a list of PDF files from the specified directory path.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list of PDF file paths.
    """
    pdf_files = []
    try:
        pdf_files = glob.glob(os.path.join(file_path, '*.pdf'))
    except Exception as e:
        print(f"Error getting PDF files from '{file_path}': {str(e)}")
    return pdf_files
