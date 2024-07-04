import logging
import os

from tqdm import tqdm
from resume_matcher.scripts.processor import Processor
from resume_matcher.scripts.utils import get_filenames_from_dir, find_path

cwd = find_path("Resume-Matcher")
RESUMES_PATH = os.path.join(cwd, "Data", "Resumes/")
JOB_DESCRIPTIONS_PATH = os.path.join(cwd, "Data", "JobDescription/")
PROCESSED_RESUMES_PATH = os.path.join(cwd, "Data", "Processed", "Resumes/")
PROCESSED_JOB_DESCRIPTIONS_PATH = os.path.join(
    cwd, "Data", "Processed", "JobDescription/"
)

logger = logging.getLogger(__name__)


def remove_old_files(files_path):
    """
    Remove all files from a specified directory.

    Args:
        files_path (str): The directory path from which to delete files.
    """
    for filename in os.listdir(files_path):
        try:
            file_path = os.path.join(files_path, filename)

            if os.path.isfile(file_path):
                os.remove(file_path)
        except Exception as e:
            logging.error(f"Error deleting {file_path}:\n{e}")

    logging.info("Deleted old files from " + files_path)


def process_files(data_path, processed_path, file_type):
    """
    Process files of a specific type (resume or job description) from a source directory.

    Args:
        data_path (str): The path to the directory containing raw files.
        processed_path (str): The path to the directory where processed files will be stored.
        file_type (str): Type of files being processed ("resume" or "job_description").
    """
    print(f"Processing {file_type}s from {data_path}")
    logging.info(f"Started to read from {data_path}")
    try:
        remove_old_files(processed_path)
        file_names = get_filenames_from_dir(data_path)
        logging.info(f"Reading from {data_path} is now complete.")
    except:
        logging.error(f"There are no {file_type}s present in the specified folder.")
        logging.error("Exiting from the program.")
        logging.error(
            f"Please add {file_type}s in the {data_path} folder and try again."
        )
        exit(1)

    logging.info(f"Started parsing the {file_type}s.")
 # Process each file using a progress bar

    for file in tqdm(file_names):
        processor_object = Processor(file, file_type)
        success = processor_object.process()
    print(f"Processing of {file_type}s is now complete.")
    logging.info(f"Parsing of the {file_type}s is now complete.")

    


def run_first():
    """
    Execute initial processing of resumes and job descriptions.
    """
    process_files(RESUMES_PATH, PROCESSED_RESUMES_PATH, "resume")
    process_files(
        JOB_DESCRIPTIONS_PATH, PROCESSED_JOB_DESCRIPTIONS_PATH, "job_description"
    )
