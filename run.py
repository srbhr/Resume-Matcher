from scripts.parsers.ParseResumeToJson import ParseResume
from scripts.parsers.ParseJobDescToJson import ParseJobDesc
from scripts.ReadPdf import read_single_pdf
import os.path

READ_DATA_FROM = '../../Data/Raw/'


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
