import json
import os
import pathlib
from typing import List

import networkx as nx
import nltk
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
import requests
from annotated_text import annotated_text, parameters
from streamlit_extras import add_vertical_space as avs
from streamlit_extras.badges import badge

from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.similarity.get_score import *
from scripts.utils import get_filenames_from_dir
from scripts.utils.logger import init_logging_config

# Define a temporary directory for uploaded files
TEMP_DIR_JOBDECRIPTION = "Data/temp_JobDescriptionToProcesss"
PROCESSED_JOBDESCRIPTION_DIR = "Data/Processed/JobDescription"

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

def create_star_graph(nodes_and_weights, title):
    # Create an empty graph
    G = nx.Graph()

    # Add the central node
    central_node = "resume"
    G.add_node(central_node)

    # Add nodes and edges with weights to the graph
    for node, weight in nodes_and_weights:
        G.add_node(node)
        G.add_edge(central_node, node, weight=weight * 100)

    # Get position layout for nodes
    pos = nx.spring_layout(G)

    # Create edge trace
    edge_x = []
    edge_y = []
    for edge in G.edges():
        x0, y0 = pos[edge[0]]
        x1, y1 = pos[edge[1]]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])

    edge_trace = go.Scatter(
        x=edge_x,
        y=edge_y,
        line=dict(width=0.5, color="#888"),
        hoverinfo="none",
        mode="lines",
    )

    # Create node trace
    node_x = []
    node_y = []
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)

    node_trace = go.Scatter(
        x=node_x,
        y=node_y,
        mode="markers",
        hoverinfo="text",
        marker=dict(
            showscale=True,
            colorscale="Rainbow",
            reversescale=True,
            color=[],
            size=10,
            colorbar=dict(
                thickness=15,
                title="Node Connections",
                xanchor="left",
                titleside="right",
            ),
            line_width=2,
        ),
    )

    # Color node points by number of connections
    node_adjacencies = []
    node_text = []
    for node in G.nodes():
        adjacencies = list(G.adj[node])  # changes here
        node_adjacencies.append(len(adjacencies))
        node_text.append(f"{node}<br># of connections: {len(adjacencies)}")

    node_trace.marker.color = node_adjacencies
    node_trace.text = node_text

    # Create the figure
    fig = go.Figure(
        data=[edge_trace, node_trace],
        layout=go.Layout(
            title=title,
            titlefont_size=16,
            showlegend=False,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        ),
    )

    # Show the figure
    st.plotly_chart(fig)


def create_annotated_text(
    input_string: str, word_list: List[str], annotation: str, color_code: str
):
    # Tokenize the input string
    tokens = nltk.word_tokenize(input_string)

    # Convert the list to a set for quick lookups
    word_set = set(word_list)

    # Initialize an empty list to hold the annotated text
    annotated_text = []

    for token in tokens:
        # Check if the token is in the set
        if token in word_set:
            # If it is, append a tuple with the token, annotation, and color code
            annotated_text.append((token, annotation, color_code))
        else:
            # If it's not, just append the token as a string
            annotated_text.append(token)

    return annotated_text


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


def tokenize_string(input_string):
    tokens = nltk.word_tokenize(input_string)
    return tokens

def process_JobDescriptionToProcess(job_description_text):
    try:
        # Process the text using the JobDescriptionProcessor class
        processor = JobDescriptionProcessor(job_description_text)
        jd_processed_file_path = processor.process()
        
        if jd_processed_file_path:
            st.success("Job Description processed successfully!")
        else:
            st.error("Error processing the Job Description.")
        
        return jd_processed_file_path
    except Exception as e:
        st.error(f"An error occurred: {str(e)}")


# Display the main title and subheaders
st.title(":blue[Resume Matcher]")
with st.sidebar:
    st.image("Assets/img/header_image.png")
    st.subheader(
        "Free and Open Source ATS to help your resume pass the screening stage."
    )
    st.markdown(
        "Check the website [www.resumematcher.fyi](https://www.resumematcher.fyi/)"
    )

st.divider()
avs.add_vertical_space(1)

def upload_resume_to_api(file):
    #Check file extension
    #print(file.name)
    if not file.name.endswith(".pdf"):
        st.error("Invalid file type. Only PDF files are allowed.")
        return {"detail": "Invalid file type. Only PDF files are allowed."}


    # Ensure 'file' is a file-like object and post it
    files = {"resume_file": (file.name, file, "application/pdf")}
    response = requests.post("http://127.0.0.1:8000/upload_resume/", files=files)
    #response.raise_for_status()  # Raise an error for bad responses
        
    return response.json()


# Upload resume
ResumeToProcess = st.file_uploader("Upload a resume file", type=["pdf"])

resume_string =""

# Function to retrieve resume content from FastAPI endpoint
def retrieve_resume_from_api(filename):
    try:
        response = requests.get(f"http://127.0.0.1:8000/retrieve_resume/{filename}")
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            raise Exception("Resume not found in the database.")
        else:
            raise Exception(f"Error retrieving resume: {response.text}")
    except Exception as e:
        st.error(f"Error: {str(e)}")

def read_resume_from_db(filename):
    try:
        # Retrieve resume content from FastAPI endpoint
        resume_content = retrieve_resume_from_api(filename)
        if resume_content:
            # Simulate saving to MongoDB or use directly if needed
            return resume_content
        else:
            raise Exception("Resume not found or empty content.")
    except Exception as e:
        raise Exception(f"Error reading resume from MongoDB: {str(e)}")

if ResumeToProcess is not None:
    st.markdown("### Resume successfully uploaded!")
    # Process and upload resume via FASTAPI endpoint
    response = upload_resume_to_api(ResumeToProcess)

    if "filename" in response:
        file_name = response["filename"]
        Resume=read_resume_from_db(file_name)
        #st.write(Resume)
        #print(type(Resume))
        annotated_text_content = annotated_text(
                        Resume["clean_data"],
                        Resume["extracted_keywords"],
                        "KW",
                        "#0B666A",
                )
        resume_string = " ".join(Resume["extracted_keywords"])

        df2 = pd.DataFrame(Resume["keyterms"], columns=["keyword", "value"])
        #st.write(resume_string)

        fig_treemap = px.treemap(
                        df2,
                        path=["keyword"],
                        values="value",
                        color_continuous_scale="Rainbow",
                        title="Key Terms/Topics Extracted from your Resume",
                    )
        st.plotly_chart(fig_treemap)


    else:
        st.error(f"Error uploading/resuming file: {response.get('detail', 'Unknown error')}")
    


st.divider()
avs.add_vertical_space(1)

st.title("Job Description Analyzer")

# Upload Job Description as text input
job_description_text = st.text_area("Enter Job Description", height=200)

jd_strings = ""
if st.button("Get similarity Score"):
        if job_description_text:
            processed_file_path = process_JobDescriptionToProcess(job_description_text)

            if processed_file_path:
                try:
                    if os.path.exists(processed_file_path):
                        jd_string = read_json(processed_file_path)

                        jd_annotated_text_content = f"Clean Data: {jd_string['clean_data']}, Extracted Keywords: {jd_string['extracted_keywords']}"
                        jd_strings = " ".join(jd_string["extracted_keywords"])

                        df_resume = pd.DataFrame(jd_string["keyterms"], columns=["keyword", "value"])
                        keyword_dict = {keyword: value * 100 for keyword, value in jd_string["keyterms"]}

                        fig = go.Figure(data=[go.Table(
                            header=dict(values=["Keyword", "Value"], font=dict(size=12), fill_color="#070A52"),
                            cells=dict(values=[list(keyword_dict.keys()), list(keyword_dict.values())],
                                       line_color="darkslategray", fill_color="#6DA9E4"))])

                        jd_fig_treemap = px.treemap(
                            df_resume,
                            path=["keyword"],
                            values="value",
                            color_continuous_scale="Rainbow",
                            title="Key Terms/Topics Extracted from your Job Description",
                        )
                        st.plotly_chart(jd_fig_treemap)
                        os.remove(processed_file_path)

                    else:
                        st.error("Processed job description file does not exist.")

                except json.JSONDecodeError as e:
                    st.error(f"JSON Decode Error: {e}")

                except Exception as e:
                    st.error(f"Error loading the processed job description file: {e}")

            else:
                st.error("Error processing the job description.")

        else:
            st.warning("Please enter a job description to process.")

avs.add_vertical_space(3)
if resume_string!="" and jd_strings!="":
    result = get_score(resume_string, jd_string)
    similarity_score = round(result[0].score * 100, 2)
    score_color = "green"
    if similarity_score < 60:
        score_color = "red"
    elif 60 <= similarity_score < 75:
        score_color = "orange"
    st.markdown(
        f"Similarity Score obtained for the resume and job description is "
        f'<span style="color:{score_color};font-size:24px; font-weight:Bold">{similarity_score}</span>',
        unsafe_allow_html=True,
    )
else:
    similarity_score=0.0
    st.markdown(
        f"Similarity Score obtained for the resume and job description is "
        f'<span style="color:{"red"};font-size:24px; font-weight:Bold">{similarity_score}</span>',
        unsafe_allow_html=True,
    )

# Go back to top
st.markdown("[:arrow_up: Back to Top](#resume-matcher)")
