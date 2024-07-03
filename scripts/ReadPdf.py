import glob #used for file path expansion (finding file matching a pattern)
import os   #used for interacting with the operating system (e.g., checking file existencce)

from pypdf import PdfReader #importing the PdfReader from the pypdf library for PDF manipulation

#finds all the PDf files in a specified directory 'file_path' and returns a list of file paths of those PDF files
def get_pdf_files(file_path):
    """
    Get all PDF files from the specified file path.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list containing the paths of all the PDF files in the directory.
    """
    if os.path.exists(file_path): #checking if the directory path file exists
        return glob.glob(os.path.join(file_path, "*.pdf")) #use glob to find all the pdf files in the directory
    else:
        return [] #returns an empty list if the path does not exist or there are no PDF files found


def read_multiple_pdf(file_path: str) -> list:
    """
    Read multiple PDF files from the specified file path and extract the text from each page.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list containing the extracted text from each page of the PDF files.
    """
    pdf_files = get_pdf_files(file_path)# gets all the pdf files in the specified directory 
    output = [] #initialize an empty list to store extracted text

    for file in pdf_files:
        try:
            with open(file, "rb") as f:
                pdf_reader = PdfReader(f) #downcast of the file as a PdfReader object(type)
                count = pdf_reader.getNumPages() #returns the number of pages in the pdf file
                for i in range(count): #iteration for the number of pages in the pdf file to run each one
                    page = pdf_reader.getPage(i) #gets a specific page from the pdf file
                    output.append(page.extractText()) #extraction the text from the page and appending it to the output list that contains the text of the pdf
        except Exception as e:
            print(f"Error reading file '{file}': {str(e)}") #printing an error message in case there was an issue reading a file
    return output # returns the text written in the pdf file


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
            pdf_reader = PdfReader(f) # downcast the type again to a PdfReader object
            count = len(pdf_reader.pages) # returns the number of pages in the single pdf file
            for i in range(count):
                page = pdf_reader.pages[i] # gets a specific page from the PDF
                output.append(page.extract_text()) #extraction  of the text then appending it to the output list
    except Exception as e:
        print(f"Error reading file '{file_path}': {str(e)}")
    return str(" ".join(output)) #returns the concatinated text from all the pages as a single string


def get_pdf_files(file_path: str) -> list:
    """
    Get a list of PDF files from the specified directory path.

    Args:
        file_path (str): The directory path containing the PDF files.

    Returns:
        list: A list of PDF file paths.
    """
    pdf_files = [] # initialization of an empty list to store PDF file paths 
    try:
        pdf_files = glob.glob(os.path.join(file_path, "*.pdf")) #use globe to find all PDF files in hte directory 
    except Exception as e:
        print(f"Error getting PDF files from '{file_path}': {str(e)}")
    return pdf_files # returns the list of file paths found in the directory


"""
    File Operations: utilizes 'os.path' and 'glob.glob' for robust file handling across different operating systems
    and file systems. The 'os.path' module provides functions for manipulating file paths, while '
    glob.glob' allows us to search for files matching a specific pattern.
"""

"""
    PDF Extraction: utilizes the 'PyPDF2' library to read and extract text from PDF files
    The 'PyPDF2' library provides a simple and intuitive API for working with PDF files,
    making it easy to extract text from them.

    os.path: is a submodule of the os module in Python, which provides functions for interacting with the filesystem.
    It allows us to manipulate file paths, such as joining them, splitting them, and getting the
    directory or filename from a path.
    
    Some functions:
    os.path.join(path, *paths): Joins one or more path components intelligently.
    os.path.split(path): Splits the path into a pair, (head, tail) where
    tail is the last pathname component and head is everything leading up to that.
    os.path.dirname(path): Returns the directory name of path.
    os.path.basename(path): Returns the base name of path, that is the last component of the
    filename.
    os.path.exists(path): Returns 'True' if the path exists 'False' otherwise.
    os.path.abspath(path): Returns the absolute version of the path.

    glob.glob: is a module in Python that helps find files and directories whose names match a
    specified pattern using Unix shell-style wildcards. It specifically returns a list of path names
    that matches the specified pattern.

    how it works? :
    glob.glob(pathname,*,recursive=False): Returns a possibly-empty list of path names that match 'pathname', which can 
    be a simple filename, a wildcard pattern containing * (mathces zero or more characters) and ? (matches exactly one character),
    or a directory name followed by * to latch all contents.
    if recursive=True, it wimm recursively search for files matching the pattern in all subdirectories.

    Exemple usage: 
    import glob

    # Example 1: Get all PDF files in the current directory
    pdf_files = glob.glob("*.pdf")
    print(pdf_files)

    # Example 2: Get all Python files in a specific directory and its subdirectories
    python_files = glob.glob("/path/to/directory/**/*.py", recursive=True)
    print(python_files)

"""