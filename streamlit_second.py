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


resume_names = get_filenames_from_dir("Data/Processed/Resumes")

st.write("There are", len(resume_names),
         " resumes present. Please select one from the menu below:")
output = st.slider('Select Resume Number', 0, 5, 2)
st.write("You have selected ", resume_names[output], " printing the resume")
selected_file = read_json("Data/Processed/Resumes/"+resume_names[output])
st.json(selected_file)


# # read the json file
# resume = read_json(
#     'Data/Processed/Resume-d531571e-e4fa-45eb-ab6a-267cdeb6647e.json')
# job_desc = read_json(
#     'Data/Processed/Job-Desc-a4f06ccb-8d5a-4d0b-9f02-3ba6d686472e.json')

# st.write("#### Your Resume")
# st.caption("This is how your resume looks after PDF Parsing:")

# st.json(resume["clean_data"])
