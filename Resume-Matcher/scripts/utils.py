import glob
import json
import logging
import os
import os.path
from uuid import uuid4

from pypdf import PdfReader

logger = logging.getLogger(__name__)


def find_path(folder_name):
    """
    The function `find_path` searches for a folder by name starting from the current directory and
    traversing up the directory tree until the folder is found or the root directory is reached.

    Args:
      folder_name: The `find_path` function you provided is designed to search for a folder by name
    starting from the current working directory and moving up the directory tree until it finds the
    folder or reaches the root directory.

    Returns:
      The `find_path` function is designed to search for a folder with the given `folder_name` starting
    from the current working directory (`os.getcwd()`). It iterates through the directory structure,
    checking if the folder exists in the current directory or any of its parent directories. If the
    folder is found, it returns the full path to that folder using `os.path.join(curr_dir, folder_name)`
    """
    curr_dir = os.getcwd()
    while True:
        if folder_name in os.listdir(curr_dir):
            return os.path.join(curr_dir, folder_name)
        else:
            parent_dir = os.path.dirname(curr_dir)
            if parent_dir == "/":
                break
            curr_dir = parent_dir
    raise ValueError(f"Folder '{folder_name}' not found.")


def read_json(path):
    """
    The `read_json` function reads a JSON file from the specified path and returns its contents, handling
    any exceptions that may occur during the process.

    Args:
      path: The `path` parameter in the `read_doc` function is a string that represents the file path to
    the JSON document that you want to read and load. This function reads the JSON data from the file
    located at the specified path.

    Returns:
      The function `read_doc(path)` reads a JSON file located at the specified `path`, and returns the
    data loaded from the file. If there is an error reading the JSON file, it logs the error message and
    returns an empty dictionary `{}`.
    """
    with open(path) as f:
        try:
            data = json.load(f)
        except Exception as e:
            logger.error(f"Error reading JSON file: {e}")
            data = {}
    return data


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
            with open(file, "rb") as f:
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
        with open(file_path, "rb") as f:
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
        pdf_files = glob.glob(os.path.join(file_path, "*.pdf"))
    except Exception as e:
        print(f"Error getting PDF files from '{file_path}': {str(e)}")
    return pdf_files


def generate_unique_id():
    """
    Generate a unique ID and return it as a string.

    Returns:
        str: A string with a unique ID.
    """
    return str(uuid4())


def get_filenames_from_dir(directory_path: str) -> list:
    filenames = [
        f
        for f in os.listdir(directory_path)
        if os.path.isfile(os.path.join(directory_path, f)) and f != ".DS_Store"
    ]
    return filenames
