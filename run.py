from scripts.parsers.ParseResumeToJson import ParseResume
from scripts.parsers.ParseJobDescToJson import ParseJobDesc
from scripts.ReadPdf import read_single_pdf
import os.path
import pathlib
import json


READ_DATA_FROM = 'Data/Raw/'
SAVE_DIRECTORY = 'Data/Processed/'


def read_resumes(input_file: str) -> dict:
    input_file_name = os.path.join(READ_DATA_FROM+input_file)
    data = read_single_pdf(input_file_name)
    output = ParseResume(data).get_JSON()
    return output


def read_job_desc(input_file: str) -> dict:
    input_file_name = os.path.join(READ_DATA_FROM + input_file)
    data = read_single_pdf(input_file_name)
    output = ParseJobDesc(data).get_JSON()
    return output


def write_json_file(resume_dictionary: dict):
    file_name = str("Resume-" + resume_dictionary["unique_id"] + ".json")
    save_directory_name = pathlib.Path(SAVE_DIRECTORY) / file_name
    json_object = json.dumps(resume_dictionary, sort_keys=True, indent=14)
    with open(save_directory_name, "w+") as outfile:
        outfile.write(json_object)
