import json
import logging
import os

from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.utils import get_filenames_from_dir, init_logging_config

init_logging_config()

script_dir = os.path.dirname(os.path.abspath(__file__))
PROCESSED_DATA_PATH = os.path.join(script_dir, "Data", "Processed")
PROCESSED_RESUMES_PATH = os.path.join(PROCESSED_DATA_PATH, "Resumes")
PROCESSED_JOB_DESCRIPTIONS_PATH = os.path.join(
    PROCESSED_DATA_PATH, "JobDescription"
)

# check if processed data directory exists
if not os.path.exists(PROCESSED_DATA_PATH):
    os.makedirs(PROCESSED_DATA_PATH)
    os.makedirs(PROCESSED_RESUMES_PATH)
    os.makedirs(PROCESSED_JOB_DESCRIPTIONS_PATH)
    logging.info("Created necessary directories.")


def read_json(filename):
    """Reads a JSON file and returns its contents as a dictionary.

    Args:
        filename (str): The path to the JSON file to be read.

    Returns:
        dict: The contents of the JSON file."""
    with open(filename) as f:
        data = json.load(f)
    return data


def remove_old_files(files_path):
    if not os.path.exists(files_path): # Check if the folder exists or not.
        # Create the folder if it doesn't exist to avoid error in the next step.
        os.makedirs(files_path)

    for filename in os.listdir(files_path):
        try:
            file_path = os.path.join(files_path, filename)

            if os.path.isfile(file_path):
                os.remove(file_path)
        except Exception as e:
            logging.error(f"Error deleting {file_path}:\n{e}")

    logging.info("Deleted old files from " + files_path)


logging.info("Started to read from Data/Resumes")
try:
    # Check if there are resumes present or not.
    if not os.path.exists(PROCESSED_RESUMES_PATH):
        # If not present then create one.
        os.makedirs(PROCESSED_RESUMES_PATH)
    else:
        # If present then parse it.
        remove_old_files(PROCESSED_RESUMES_PATH)

    file_names = get_filenames_from_dir("Data/Resumes")
    logging.info("Reading from Data/Resumes is now complete.")
except Exception:
    # Exit the program if there are no resumes.
    logging.error("There are no resumes present in the specified folder.")
    logging.error("Exiting from the program.")
    logging.error(
        "Please add resumes in the Data/Resumes folder and try again."
    )
    exit(1)

# Now after getting the file_names parse the resumes into a JSON Format.
logging.info("Started parsing the resumes.")
for file in file_names:
    processor = ResumeProcessor(file)
    success = processor.process()
logging.info("Parsing of the resumes is now complete.")

logging.info("Started to read from Data/JobDescription")
try:
    # Check if there are resumes present or not.
    if not os.path.exists(PROCESSED_JOB_DESCRIPTIONS_PATH):
        # If not present then create one.
        os.makedirs(PROCESSED_JOB_DESCRIPTIONS_PATH)
    else:  
    # If present then parse it.
        remove_old_files(PROCESSED_JOB_DESCRIPTIONS_PATH)

    file_names = get_filenames_from_dir("Data/JobDescription")
    logging.info("Reading from Data/JobDescription is now complete.")
except Exception:
    # Exit the program if there are no resumes.
    logging.error(
        "There are no job-description present in the specified folder."
    )
    logging.error("Exiting from the program.")
    logging.error(
        "Please add resumes in the Data/JobDescription folder and try again."
    )
    exit(1)

# Now after getting the file_names parse the resumes into a JSON Format.
logging.info("Started parsing the Job Descriptions.")
for file in file_names:
    processor = JobDescriptionProcessor(file)
    success = processor.process()
logging.info("Parsing of the Job Descriptions is now complete.")
logging.info("Success now run `streamlit run streamlit_second.py`")
