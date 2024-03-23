import json
import logging
import os

from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.utils import get_filenames_from_dir, init_logging_config

init_logging_config()

PROCESSED_RESUMES_PATH = "Data/Processed/Resumes"
PROCESSED_JOB_DESCRIPTIONS_PATH = "Data/Processed/JobDescription"


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


def remove_old_files(files_path):

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
    # If present then parse it.
    remove_old_files(PROCESSED_RESUMES_PATH)

    file_names = get_filenames_from_dir("Data/Resumes")
    logging.info("Reading from Data/Resumes is now complete.")
except:
    # Exit the program if there are no resumes.
    logging.error("There are no resumes present in the specified folder.")
    logging.error("Exiting from the program.")
    logging.error("Please add resumes in the Data/Resumes folder and try again.")
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
    # If present then parse it.
    remove_old_files(PROCESSED_JOB_DESCRIPTIONS_PATH)

    file_names = get_filenames_from_dir("Data/JobDescription")
    logging.info("Reading from Data/JobDescription is now complete.")
except:
    # Exit the program if there are no resumes.
    logging.error("There are no job-description present in the specified folder.")
    logging.error("Exiting from the program.")
    logging.error("Please add resumes in the Data/JobDescription folder and try again.")
    exit(1)

# Now after getting the file_names parse the resumes into a JSON Format.
logging.info("Started parsing the Job Descriptions.")
for file in file_names:
    processor = JobDescriptionProcessor(file)
    success = processor.process()
logging.info("Parsing of the Job Descriptions is now complete.")
logging.info("Success now run `streamlit run streamlit_second.py`")
