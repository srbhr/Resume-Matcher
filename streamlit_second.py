import streamlit as st
import pandas as pd
import json
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
from scripts.utils.ReadFiles import get_filenames_from_dir
from scripts.ResumeProcessor import ResumeProcessor
import time


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


st.image('Assets/img/header_image.jpg')

st.markdown("#### 🟧 Please put your resumes in the `Data/Resumes` folder.")
st.markdown("##### There are some sample resumes in the `Data/Resumes` folder. The app automatically starts using the files present there.")


file_names = get_filenames_from_dir("Data/Resumes")
st.write("There are", len(file_names), " resumes present.")

st.info('Resumes are getting parsed, please wait.', icon="ℹ️")

for file in file_names:
    processor = ResumeProcessor(file)
    success = processor.process()
st.success('All the resumes have been parsed', icon="✅")

resume_names = get_filenames_from_dir("Data/Processed/Resumes")

st.write("There are", len(file_names),
         " resumes present. Please select one from the menu below:")
output = st.radio("Select from the resumes below:",
                  resume_names)
st.write("You have selected ", output, " printing the resume")
selected_file = read_json("Data/Processed/Resumes/"+output)
st.json(selected_file)


# # read the json file
# resume = read_json(
#     'Data/Processed/Resume-d531571e-e4fa-45eb-ab6a-267cdeb6647e.json')
# job_desc = read_json(
#     'Data/Processed/Job-Desc-a4f06ccb-8d5a-4d0b-9f02-3ba6d686472e.json')

# st.write("#### Your Resume")
# st.caption("This is how your resume looks after PDF Parsing:")

# st.json(resume["clean_data"])
