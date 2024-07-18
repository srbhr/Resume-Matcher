import json
import os
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
    if not file.name.endswith(".pdf"):
        st.error("Invalid file type. Only PDF files are allowed.")
        return {"detail": "Invalid file type. Only PDF files are allowed."}

    # Ensure 'file' is a file-like object and post it
    files = {"resume_file": (file.name, file, "application/pdf")}
    response = requests.post("http://127.0.0.1:8000/upload_resume/", files=files)

    return response.json()


# Upload resume
ResumeToProcess = st.file_uploader("Upload a Resume file (PDF only)", type=["pdf"])
if ResumeToProcess is not None:
    st.markdown("### Resume successfully uploaded!")
    #st.write(upload_resume_to_api(ResumeToProcess))
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


st.divider()
avs.add_vertical_space(1)


st.title("Job Descriptions Analyzer")
# Upload Job Description as text input
job_description_text = st.text_area("Enter Job Description", height=200)
if job_description_text is not None:
    st.markdown("### Job descriptions successfully uploaded!")


def calculate_similarity_score_from_api(file):
    if not file.name.endswith(".pdf"):
        st.error("Invalid file type. Only PDF files are allowed.")
        return {"detail": "Invalid file type. Only PDF files are allowed."}
    # Ensure 'file' is a file-like object and post it
    files = {"resume_file": (file.name, file, "application/pdf")}
    try:
        response = requests.post(
            "http://127.0.0.1:8000/calculate_similarity_score/",
            files=files)
        
        if response.status_code == 200:
            data = response.json()
            return data
        else:
            raise Exception(f"Error : {response.text}")
    except Exception as e:
        st.error(f"An error occurred: {str(e)}")


def upload_job_descriptions_to_api(job_descriptions):
    """formatted_data = []

    # Iterate through each job description and split it
    for job_desc in job_descriptions:
        job_data = convert_str_to_json(job_desc)
        formatted_data.append(job_data)

    print(formatted_data)"""

    url = "http://127.0.0.1:8000/upload_job_descriptions/"    
    try:
        response = requests.post(url, json=job_descriptions)
        #response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        
        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"Unexpected status code: {response.status_code}\n{response.text}")
            
        
    except requests.exceptions.RequestException as e:
        st.error(f"Request failed: {e}")
        return None



def create_treemap(keyterms, title):
    df2 = pd.DataFrame(keyterms, columns=["term", "score"])
    fig = px.treemap(
        df2,
        path=["keyword"],
        values="value",
        color_continuous_scale="Rainbow",
        title=title)
    return fig


def get_similarity_scores(resume_filename):
    url = "http://localhost:8000/similarity_scores/"
    params = {"resume_filename": resume_filename}
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            similarity_scores = response.json()
            return similarity_scores
        elif response.status_code == 404:
            st.error(f"Resume filename '{resume_filename}' not found.")
        else:
            st.error(f"Error fetching similarity scores: {response.text}")
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching similarity scores: {str(e)}")




#get similarity score button to lunch the app
if st.button("Get similarity Score"):
    if ResumeToProcess is not None and job_description_text!="":
        # Process and upload resume via FASTAPI endpoint
 
        upload_job_descriptions_to_api(job_description_text)
        #resume_keyterms,resume_filename = calculate_similarity_score_from_api(ResumeToProcess)
        #similarity_data=get_similarity_scores(resume_filename)
        #result = calculate_similarity_score_from_api(ResumeToProcess)
        print( upload_job_descriptions_to_api([job_description_text]))

        """similarity_data=get_similarity_scores(resume_filename)
        if resume_keyterms:
            st.plotly_chart(create_treemap(resume_keyterms,"Key Terms/Topics Extracted from your Resume"))
        
        if similarity_data:
            st.subheader("Similarity scores: ")
            similarity_scores=similarity_data['similarity_scores']
            if similarity_scores:
                score_table=[]
                for score in similarity_scores:
                    score_table.append([score['job_description_filename'],score['similarity_score']])
                st.table(score_table)
    

avs.add_vertical_space(3)

# Go back to top
st.markdown("[:arrow_up: Back to Top](#resume-matcher)")"""
