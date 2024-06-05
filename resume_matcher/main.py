import os

from resume_matcher.run_first import run_first
from resume_matcher.scripts.get_score import get_score
from resume_matcher.scripts.logger import init_logging_config
from resume_matcher.scripts.utils import find_path, read_json

init_logging_config()

run_first()

cwd = find_path("Resume-Matcher")

PROCESSED_RESUMES_PATH = os.path.join(cwd, "Data", "Processed", "Resumes/")
PROCESSED_JOB_DESCRIPTIONS_PATH = os.path.join(
    cwd, "Data", "Processed", "JobDescription/"
)


def get_filenames_from_dir(directory):
    return [f for f in os.listdir(directory) if os.path.isfile(os.path.join(directory, f))]


def process_files(resume, job_description):
    resume_dict = read_json(PROCESSED_RESUMES_PATH + resume)
    job_dict = read_json(PROCESSED_JOB_DESCRIPTIONS_PATH + job_description)
    resume_keywords = resume_dict["extracted_keywords"]
    job_description_keywords = job_dict["extracted_keywords"]

    resume_string = " ".join(resume_keywords)
    jd_string = " ".join(job_description_keywords)
    final_result = get_score(resume_string, jd_string)
    for r in final_result:
        print(r.score)
    print(f"Processing resume: {resume}")
    print(f"Processing job description: {job_description}")



