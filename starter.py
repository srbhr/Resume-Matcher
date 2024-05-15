import json
import os
from typing import List
import subprocess

import networkx as nx
import nltk
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from annotated_text import annotated_text, parameters
from streamlit_extras import add_vertical_space as avs
from streamlit_extras.badges import badge

from scripts.similarity.get_score import *
from scripts.utils import get_filenames_from_dir
from scripts.utils.logger import init_logging_config
import run_first

# Set page configuration
st.set_page_config(
    page_title="Resume Matcher",
    page_icon="Assets/img/favicon.ico",
    initial_sidebar_state="auto",
)

init_logging_config()
cwd = find_path("Resume-Matcher")
config_path = os.path.join(cwd, "scripts", "similarity")

try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")

parameters.SHOW_LABEL_SEPARATOR = False
parameters.BORDER_RADIUS = 3
parameters.PADDING = "0.5 0.25rem"

# Display the main title and subheaders
st.title(":blue[Resume Matcher]")
with st.sidebar:
    st.image("Assets/img/header_image.png")
    st.subheader(
        "Free and Open Source ATS to help your resume pass the screening stage."
    )
    st.markdown(
        "Create Your ATS friendly Resume [www.atsreseume.app](https://atsresume.vercel.app/)"
    )

    
st.divider()
avs.add_vertical_space(1)







# Addition changes

uploaded_resume = st.file_uploader("Upload your Resume", type=["pdf"])
if uploaded_resume is not None:
    res_name=uploaded_resume.name
    res_save_path = os.path.join("Data/Resumes/", res_name)
    with open(res_save_path, "wb") as f:
        f.write(uploaded_resume.getvalue())
    st.write("Resume saved successfully!")
else: 
    st.write("Upload your Resume to continue")

uploaded_jd = st.file_uploader("Choose a jd", type=["pdf"])
if uploaded_jd is not None:
    jd_name=uploaded_jd.name
    jd_save_path = os.path.join("Data/JobDescription/", jd_name)
    with open(jd_save_path, "wb") as f:
        f.write(uploaded_jd.getvalue())
    st.write("Job Description saved successfully!")
else: 
    st.write("Upload your JD to continue")





# Replace 'script_to_execute.py' with the name of the Python file you want to execute
script_path = 'run_first.py'
if uploaded_resume is not None and uploaded_jd is not None:
    # Run the Python script
    # subprocess.run(['python', script_path])
    run_first.processing_function()

