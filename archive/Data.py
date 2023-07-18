import json
from scripts.utils.ReadFiles import get_filenames_from_dir

resume_path = "Data/Processed/Resumes"
job_path = "Data/Processed/JobDescription"


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


def build_resume_list(resume_names, path):
    resumes = []
    for resume in resume_names:
        selected_file = read_json(path + '/' + resume)
        resumes.append({
            "resume": selected_file["clean_data"]
        })
    return resumes


def build_jobdesc_list(jobdesc_names, path):
    resumes = []
    for resume in resume_names:
        selected_file = read_json(path + '/' + resume)
        resumes.append({
            "resume": selected_file["clean_data"]
        })
    return resumes


resume_names = get_filenames_from_dir(resume_path)
resumes = build_resume_list(resume_names, resume_path)

jobdesc_names = get_filenames_from_dir(job_path)
jobdescs = build_jobdesc_list(jobdesc_names, job_path)

print(resumes)
print(jobdescs)
