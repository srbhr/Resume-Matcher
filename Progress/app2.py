from wordcloud import STOPWORDS
from operator import index
from wordcloud import WordCloud
from pandas._config.config import options
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import Similar

# Reading the CSV files prepared by the fileReader.py
Resumes = pd.read_csv('Resume_data.csv')
Jobs = pd.read_csv('Job_Data.csv')


# Checking for Multiple Job Descriptions
# If more than one Job Descriptions are available, it asks user to select one as well.

if len(Jobs['Name']) <= 1:
    st.write(
        "There is only 1 Job Description present. It will be used to create scores.")
else:
    st.write("There are ", len(Jobs['Name']),
             "Job Descriptions available. Please select one.")


# Asking to Print the Job Desciption Names
if len(Jobs['Name']) > 1:
    option_yn = st.selectbox(
        "Show the Job Description Names?", options=['NO', 'YES'])
    if option_yn == 'YES':
        index = [a for a in range(len(Jobs['Name']))]
        fig = go.Figure(data=[go.Table(header=dict(values=["Job No.", "Job Desc. Name"], line_color='darkslategray',
                                                   fill_color='lightskyblue'),
                                       cells=dict(values=[index, Jobs['Name']], line_color='darkslategray',
                                                  fill_color='cyan'))
                              ])
        st.write(fig)


# Asking to chose the Job Description
index = st.slider("Which JD to select ? : ", 0,
                  len(Jobs['Name'])-1, 1)


option_yn = st.selectbox("Show the Job Description ?", options=['NO', 'YES'])
if option_yn == 'YES':
    st.markdown("---")
    st.markdown("### Job Description :")
    st.text(Jobs['Context'][index])
    st.markdown("---")


# def calculate_scores(resumes, job_description, x=5, y=5):
#     scores = []
#     for text in resumes:
#         score = Similar.match(esumes['TF_Based'][x], Jobs[])
#         scores.append(score)
#     return scores

def Scoring()
