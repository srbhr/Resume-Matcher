import os
import sys

FILE_PATH = os.path.abspath(__file__)
SUBMODULE_PARENT_DIR = os.path.abspath(os.path.join(FILE_PATH, os.pardir))
sys.path.append(SUBMODULE_PARENT_DIR)


def print_submodule_path() -> None:
    print("file path:", FILE_PATH)
    print("submodule parent dir:", SUBMODULE_PARENT_DIR)

def list_unhidden_files(dir_):
    def is_hidden(file_) -> bool:
        return file_.startswith('.')
    res = [f for f in os.listdir(dir_) if not is_hidden(f)]
    print(res)
    return res

import json
from scripts import ResumeProcessor
from scripts.utils import init_logging_config, get_filenames_from_dir
import logging
import os

init_logging_config()

PROCESSED_RESUMES_PATH = os.path.join(SUBMODULE_PARENT_DIR, "Data/Processed/Resumes")
RESUME_INPUT_DIR = os.path.join(SUBMODULE_PARENT_DIR, "Data/Resumes")



def parser() -> None:
    def read_json(filename):
        with open(filename) as f:
            data = json.load(f)
        return data

    def remove_old_files(files_path):
        logging.info("Unhidden files:")
        logging.info(list_unhidden_files(files_path))

        for filename in list_unhidden_files(files_path):
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

        file_names = get_filenames_from_dir(RESUME_INPUT_DIR)
        logging.info("Reading from Data/Resumes is now complete.")
        logging.info("Unhidden files:")
        logging.info(list_unhidden_files(RESUME_INPUT_DIR))
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
    LOGGING.info("Parsing of the resumes is now complete.")
