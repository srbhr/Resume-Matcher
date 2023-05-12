from ParseResumeToJson import ParseResume
from ParseJobDescToJson import ParseJobDesc
from ReadPdf import read_single_pdf


def read_resumes(input_file: str) -> dict:
    data = read_single_pdf(input_file)
    output = ParseResume(data).get_JSON()
    return output


def read_job_desc(input_file: str) -> dict:
    data = read_single_pdf(input_file)
    output = ParseJobDesc(data).get_JSON()
    return output
