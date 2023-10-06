from fastapi import UploadFile
from os import listdir, unlink
from os.path import join, isfile, abspath
from typing import List
from reportlab.pdfgen import canvas  # type: ignore
from reportlab.lib.pagesizes import A4  # type: ignore
from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
from reportlab.platypus import Paragraph  # type: ignore
from ..schemas.resume_processor import Job


def clear_directory_of_local_files(*path: str) -> None:
    """
    Clears the directory at the specified path.

    Args:
      *path (str): The path to the directory to clear.
    """

    full_path_to_dir = build_full_file_path(*path)

    # Print the path to the directory to clear
    print(f"clear_directory() path > {full_path_to_dir}", "\n")

    # Clear the directory at the specified path
    for file in listdir(full_path_to_dir):
        file_path = join(full_path_to_dir, file)
        try:
            # Check if the file exists, and contains .local., then delete it
            if isfile(file_path) and ".local." in file_path:
                unlink(file_path)
                print(f"clear_directory() deleted > {file_path}", "\n")
        except Exception as e:
            print(f"clear_directory() error > {e}", "\n")


def build_full_file_path(*path: str) -> str:
    """
    Returns the full file path from the list of path segments.

    Args:
      *path (str): The path segments.

    Returns:
      str: The full file path.
    """

    # Get the absolute path to the project base directory (step back 1 directory from the webapp/ directory)
    project_absolute_path = abspath("./..")
    sub_path = join(*path)

    # Print the path to the directory to clear
    print(f"build_full_file_path() path > {project_absolute_path=}", "\n")
    print(f"build_full_file_path() path > {sub_path=}", "\n")

    # Return the full file path
    return join(project_absolute_path, sub_path)


def save_file_upload(file: UploadFile) -> str:
    """
    Saves the uploaded file to the local filesystem.

    Args:
      file (UploadFile): The file to be saved.

    Returns:
      str: The path where the file is saved.
    """


    # Clear the directory of local files
    clear_directory_of_local_files("Data", "Resumes")

    # Get the file name and extension from the file name
    file_name_parts = file.filename.split(".") if file.filename else []
    file_name = file_name_parts[0] if len(file_name_parts) > 1 else "resume"
    file_extension = f".{file_name_parts[-1]}" if len(file_name_parts) > 1 else ""

    # Combine the file name and extension to create the full file name
    full_file_name = f"{file_name}.local{file_extension}"

    # Set the path where the file will be saved (from project base directory)
    save_file_path = build_full_file_path("Data", "Resumes", full_file_name)

    # Save the file to the local filesystem
    with open(save_file_path, "wb") as buffer:
        buffer.write(file.file.read())

    # Print the path where the file is saved
    print(f"save_file() file saved to > {save_file_path=}", "\n")

    # Return the path where the file is saved
    return save_file_path


def save_job_uploads_to_pdfs(jobs: List[Job]):
    # Clear the directory of local files
    clear_directory_of_local_files("Data", "JobDescription")

    for job in jobs:
        job_id = job.id
        job_description = job.description or "No description provided."

        print(f"save_job_uploads_to_pdfs() job_id > {job_id}", "\n")
        print(f"save_job_uploads_to_pdfs() job_description > {job_description}", "\n")

        # blank_pdf_file_path = build_full_file_path(
        #     "webapp", "backend", "data", "blank.pdf"
        # )

        job_desc_pdf_file_path = build_full_file_path(
            "Data", "JobDescription", f"{job_id}.local.pdf"
        )

        # solution  to wrap text in a PDF sourced from: https://stackoverflow.com/a/74243699/5033801
        # there may be a better solution to this, but this works for now
        text_width = A4[0] / 1.25
        text_height = A4[1] / 4
        x = A4[0] / 10
        y = A4[1] / 2.25
        styles = getSampleStyleSheet()

        pdf_canvas = canvas.Canvas(job_desc_pdf_file_path, pagesize=A4)

        p = Paragraph(job_description, styles["Normal"])  # type: ignore
        p.wrapOn(pdf_canvas, text_width, text_height)  # type: ignore
        p.drawOn(pdf_canvas, x, y)  # type: ignore

        print(f"save_job_uploads_to_pdfs() job_desc_pdf_file_path > {job_desc_pdf_file_path}", "\n")

        pdf_canvas.save()
