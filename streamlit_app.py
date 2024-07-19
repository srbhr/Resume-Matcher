import json
import os
from typing import List

import networkx as nx
import nltk
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from pydantic import BaseModel
import streamlit as st
import requests
from annotated_text import annotated_text, parameters
from streamlit_extras import add_vertical_space as avs
from streamlit_extras.badges import badge

from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.similarity.get_score import *
from scripts.utils import get_filenames_from_dir
from scripts.utils.logger import init_logging_config

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
    G = nx.Graph()
    central_node = "resume"
    G.add_node(central_node)
    for node, weight in nodes_and_weights:
        G.add_node(node)
        G.add_edge(central_node, node, weight=weight * 100)
    pos = nx.spring_layout(G)
    edge_x, edge_y = [], []
    for edge in G.edges():
        x0, y0 = pos[edge[0]]
        x1, y1 = pos[edge[1]]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])
    edge_trace = go.Scatter(
        x=edge_x, y=edge_y, line=dict(width=0.5, color="#888"), hoverinfo="none", mode="lines"
    )
    node_x, node_y = [], []
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
    node_trace = go.Scatter(
        x=node_x, y=node_y, mode="markers", hoverinfo="text",
        marker=dict(
            showscale=True, colorscale="Rainbow", reversescale=True, color=[], size=10,
            colorbar=dict(thickness=15, title="Node Connections", xanchor="left", titleside="right"),
            line_width=2,
        )
    )
    node_adjacencies, node_text = [], []
    for node in G.nodes():
        adjacencies = list(G.adj[node])
        node_adjacencies.append(len(adjacencies))
        node_text.append(f"{node}<br># of connections: {len(adjacencies)}")
    node_trace.marker.color = node_adjacencies
    node_trace.text = node_text
    fig = go.Figure(
        data=[edge_trace, node_trace],
        layout=go.Layout(
            title=title, titlefont_size=16, showlegend=False, hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        ),
    )
    st.plotly_chart(fig)

st.title(":blue[Resume Matcher]")
with st.sidebar:
    st.image("Assets/img/header_image.png")
    st.subheader("Free and Open Source ATS to help your resume pass the screening stage.")
    st.markdown("Check the website [www.resumematcher.fyi](https://www.resumematcher.fyi/)")

st.divider()
avs.add_vertical_space(1)

ResumeToProcess = st.file_uploader("Upload a Resume file (PDF only)", type=["pdf"])
if ResumeToProcess is not None:
    st.markdown("### Resume successfully uploaded!")


st.divider()
avs.add_vertical_space(1)

st.title("Job Descriptions Analyzer")
job_description_text = st.text_area("Enter Job Description", height=200)
if job_description_text is not None:
    st.markdown("### Job descriptions successfully uploaded!")

def calculate_similarity_score_from_api(id, file):
    if not file.name.endswith(".pdf"):
        st.error("Invalid file type. Only PDF files are allowed.")
        return {"detail": "Invalid file type. Only PDF files are allowed."}
    files = {"resume_file": (file.name, file, "application/pdf")}
    try:
        response = requests.post(
            f"http://127.0.0.1:8000/calculate_similarity_score/?id={id}", files=files
        )
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Error : {response.text}")
    except Exception as e:
        st.error(f"An error occurred: {str(e)}")

def upload_job_descriptions_to_api(job_descriptions):
    url = "http://127.0.0.1:8000/upload_job_descriptions/"
    try:
        response = requests.post(url, json=job_descriptions)
        response.raise_for_status()
        if response.status_code == 200:
            response_json = response.json()
            id = response_json.get("_id")
            if id:
                return id
            else:
                st.error("Response does not contain '_id'.")
        else:
            st.error(f"Unexpected status code: {response.status_code}\n{response.text}")
    except requests.exceptions.RequestException as e:
        st.error(f"Request failed: {e}")

def create_treemap(keyterms, title):
    # Convert the list of dictionaries into a DataFrame
    df2 = pd.DataFrame(keyterms, columns=["term", "score"])
    
    # Create and return the treemap figure
    fig = px.treemap(
        df2, path=["term"], values="score", color="score", color_continuous_scale="Rainbow", title=title
    )
    return fig

def get_similarity_scores(resume_filename):
    url = "http://localhost:8000/similarity_scores/"
    params = {"resume_filename": resume_filename}
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            st.error(f"Resume filename '{resume_filename}' not found.")
        else:
            st.error(f"Error fetching similarity scores: {response.text}")
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching similarity scores: {str(e)}")
 # Function to apply color based on similarity score
def color_scores(val):
    if val < 60:
        color = 'red'
    elif 60 <= val < 75:
        color = 'orange'
    else:
        color = 'green'
    return f'color: {color}'
class JobDescription(BaseModel):
    filename: str
    text_array: List[str]

if st.button("Get similarity Score"):
    if ResumeToProcess is not None and job_description_text:
        job_descriptions = json.loads(job_description_text)
        valid_job_descriptions = [JobDescription(**jd) for jd in job_descriptions]
        valid_job_descriptions_dict = [jd.dict() for jd in valid_job_descriptions]

        id = upload_job_descriptions_to_api(valid_job_descriptions_dict)
        
        if id:
            response = calculate_similarity_score_from_api(id, ResumeToProcess)
 
            if response:
                if "detail" not in response:
                    resume_filename = response[0]
                    resume_keyterms = response[1]
                    #st.write(resume_keyterms)
                    #similarity_scores = response[2]
                    #st.write(similarity_scores)
                    
                    if resume_keyterms:
                        st.plotly_chart(create_treemap(resume_keyterms, "Key Terms/Topics Extracted from your Resume"))
                    
                    similarity_data = get_similarity_scores(resume_filename)
                    #st.write(similarity_data)
                    if similarity_data:
                        st.subheader("Similarity scores: ")
                        # Prepare the data for the table
                        table_data = []
                        for score in similarity_data:
                            job_desc = score["job_description_filename"]
                            similarity_score = score['similarity_score']
                            table_data.append([job_desc, similarity_score])
                        df = pd.DataFrame(table_data, columns=["Job Description Filename", "Similarity Score"])

                        # Apply color formatting
                        styled_df = df.style.applymap(color_scores, subset=['Similarity Score'])

                        # Format the similarity scores to two decimal places for display
                        styled_df = styled_df.format({"Similarity Score": "{:.2f}"})

                        # Display the DataFrame
                        st.dataframe(styled_df, use_container_width=True)
                    else:
                        st.error(response["detail"])

avs.add_vertical_space(3)

# Go back to top
st.markdown("[:arrow_up: Back to Top](#resume-matcher)")

