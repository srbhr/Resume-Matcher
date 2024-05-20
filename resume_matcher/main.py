import os
import tkinter as tk
from tkinter import ttk, messagebox

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
    messagebox.showinfo("Success",
                        f"Processed files:\nResume: {resume}\nJob Description: {job_description}Similarity Score: {r.score})")


class App(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("Resume and Job Description Selector")
        self.geometry("500x300")
        self.configure(bg='#f0f0f0')

        self.create_widgets()

    def create_widgets(self):
        title_label = tk.Label(self, text="Resume and Job Description Selector", font=("Helvetica", 16, "bold"),
                               bg='#f0f0f0')
        title_label.pack(pady=20)

        resume_frame = tk.Frame(self, bg='#f0f0f0')
        resume_frame.pack(pady=10)

        tk.Label(resume_frame, text="Select Resume:", font=("Helvetica", 12), bg='#f0f0f0').pack(side=tk.LEFT, padx=5)
        self.resume_var = tk.StringVar()
        self.resume_combobox = ttk.Combobox(resume_frame, textvariable=self.resume_var)
        self.resume_combobox["values"] = get_filenames_from_dir(PROCESSED_RESUMES_PATH)
        self.resume_combobox.pack(side=tk.LEFT, padx=5)

        jd_frame = tk.Frame(self, bg='#f0f0f0')
        jd_frame.pack(pady=10)

        tk.Label(jd_frame, text="Select Job Description:", font=("Helvetica", 12), bg='#f0f0f0').pack(side=tk.LEFT,
                                                                                                      padx=5)
        self.jd_var = tk.StringVar()
        self.jd_combobox = ttk.Combobox(jd_frame, textvariable=self.jd_var)
        self.jd_combobox["values"] = get_filenames_from_dir(PROCESSED_JOB_DESCRIPTIONS_PATH)
        self.jd_combobox.pack(side=tk.LEFT, padx=5)

        self.submit_button = tk.Button(self, text="Submit", command=self.on_submit, font=("Helvetica", 12),
                                       bg='#4caf50', fg='white')
        self.submit_button.pack(pady=20)

    def on_submit(self):
        resume = self.resume_var.get()
        job_description = self.jd_var.get()

        if not resume or not job_description:
            messagebox.showerror("Error", "Please select both a resume and a job description.")
            return

        process_files(resume, job_description)


if __name__ == "__main__":
    app = App()
    app.mainloop()
