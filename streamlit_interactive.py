# Import necessary libraries
import json
import os
from typing import List

import networkx as nx
import nltk
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from annotated_text import annotated_text, parameters
from streamlit_extras import add_vertical_space as avs
from streamlit_extras.badges import badge

from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.parsers import ParseJobDesc, ParseResume
from scripts.ReadPdf import read_single_pdf
from scripts.similarity.get_score import *
from scripts.utils import get_filenames_from_dir

# Set page configuration
st.set_page_config(
    page_title="Resume Matcher",
    page_icon="Assets/img/favicon.ico",
    initial_sidebar_state="auto",
    layout="wide",
)

# Find the current working directory and configuration path
cwd = find_path("Resume-Matcher")
config_path = os.path.join(cwd, "scripts", "similarity")

# Check if NLTK punkt data is available, if not, download it
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")

# Set some visualization parameters using the annotated_text library
parameters.SHOW_LABEL_SEPARATOR = False
parameters.BORDER_RADIUS = 3
parameters.PADDING = "0.5 0.25rem"


# Function to set session state variables
def update_session_state(key, val):
    st.session_state[key] = val


# Function to delete all files in a directory
def delete_from_dir(filepath: str) -> bool:
    try:
        for file in os.scandir(filepath):
            os.remove(file.path)

        return True
    except OSError as error:
        print(f"Exception: {error}")
        return False


# Function to create a star-shaped graph visualization
def create_star_graph(nodes_and_weights, title):
    """
    Create a star-shaped graph visualization.

    Args:
        nodes_and_weights (list): List of tuples containing nodes and their weights.
        title (str): Title for the graph.

    Returns:
        None
    """
    # Create an empty graph
    graph = nx.Graph()

    # Add the central node
    central_node = "resume"
    graph.add_node(central_node)

    # Add nodes and edges with weights to the graph
    for node, weight in nodes_and_weights:
        graph.add_node(node)
        graph.add_edge(central_node, node, weight=weight * 100)

    # Get position layout for nodes
    pos = nx.spring_layout(graph)

    # Create edge trace
    edge_x = []
    edge_y = []
    for edge in graph.edges():
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
    for node in graph.nodes():
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
    for node in graph.nodes():
        adjacencies = list(graph.adj[node])  # Changes here
        node_adjacencies.append(len(adjacencies))
        node_text.append(f"{node}<br># of connections: {len(adjacencies)}")

    node_trace.marker.color = node_adjacencies
    node_trace.text = node_text

    # Create the figure
    figure = go.Figure(
        data=[edge_trace, node_trace],
        layout=go.Layout(
            title=title,
            titlefont=dict(size=16),
            showlegend=False,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        ),
    )

    # Show the figure
    st.plotly_chart(figure, use_container_width=True)


# Function to create annotated text with highlighting
def create_annotated_text(
    input_string: str, word_list: List[str], annotation: str, color_code: str
):
    """
    Create annotated text with highlighted keywords.

    Args:
        input_string (str): The input text.
        word_list (List[str]): List of keywords to be highlighted.
        annotation (str): Annotation label for highlighted keywords.
        color_code (str): Color code for highlighting.

    Returns:
        List: Annotated text with highlighted keywords.
    """
    # Tokenize the input string
    tokens = nltk.word_tokenize(input_string)

    # Convert the list to a set for quick lookups
    word_set = set(word_list)

    # Initialize an empty list to hold the annotated text
    ret_annotated_text = []

    for token in tokens:
        # Check if the token is in the set
        if token in word_set:
            # If it is, append a tuple with the token, annotation, and color code
            ret_annotated_text.append((token, annotation, color_code))
        else:
            # If it's not, just append the token as a string
            ret_annotated_text.append(token)

    return ret_annotated_text


# Function to read JSON data from a file
def read_json(filename):
    """
    Read JSON data from a file.

    Args:
        filename (str): The path to the JSON file.

    Returns:
        dict: The JSON data.
    """
    with open(filename) as f:
        data = json.load(f)
    return data


# Function to tokenize a string
def tokenize_string(input_string):
    """
    Tokenize a string into words.

    Args:
        input_string (str): The input string.

    Returns:
        List[str]: List of tokens.
    """
    tokens = nltk.word_tokenize(input_string)
    return tokens


# Cleanup processed resume / job descriptions
delete_from_dir(os.path.join(cwd, "Data", "Processed", "Resumes"))
delete_from_dir(os.path.join(cwd, "Data", "Processed", "JobDescription"))

# Set default session states for first run
if "resumeUploaded" not in st.session_state.keys():
    update_session_state("resumeUploaded", "Pending")
    update_session_state("resumePath", "")
if "jobDescriptionUploaded" not in st.session_state.keys():
    update_session_state("jobDescriptionUploaded", "Pending")
    update_session_state("jobDescriptionPath", "")

# Display the main title and sub-headers
st.title(":blue[Resume Matcher]")
with st.sidebar:
    st.image("Assets/img/header_image.png")
    st.subheader(
        "Free and Open Source ATS to help your resume pass the screening stage."
    )
    st.markdown(
        "Check the website [www.resumematcher.fyi](https://www.resumematcher.fyi/)"
    )
    st.markdown(
        "Give Resume Matcher a ⭐ on [GitHub](https://github.com/srbhr/resume-matcher)"
    )
    badge(type="github", name="srbhr/Resume-Matcher")
    st.markdown("For updates follow me on Twitter.")
    badge(type="twitter", name="_srbhr_")
    st.markdown(
        "If you like the project and would like to further help in development please consider 👇"
    )
    badge(type="buymeacoffee", name="srbhr")

st.divider()
avs.add_vertical_space(1)

with st.container():
    resumeCol, jobDescriptionCol = st.columns(2)
    with resumeCol:
        uploaded_Resume = st.file_uploader("Choose a Resume", type="pdf")
        if uploaded_Resume is not None:
            if st.session_state["resumeUploaded"] == "Pending":
                save_path_resume = os.path.join(
                    cwd, "Data", "Resumes", uploaded_Resume.name
                )

                with open(save_path_resume, mode="wb") as w:
                    w.write(uploaded_Resume.getvalue())

                if os.path.exists(save_path_resume):
                    st.toast(
                        f"File {uploaded_Resume.name} is successfully saved!", icon="✔️"
                    )
                    update_session_state("resumeUploaded", "Uploaded")
                    update_session_state("resumePath", save_path_resume)
        else:
            update_session_state("resumeUploaded", "Pending")
            update_session_state("resumePath", "")

    with jobDescriptionCol:
        uploaded_JobDescription = st.file_uploader(
            "Choose a Job Description", type="pdf"
        )
        if uploaded_JobDescription is not None:
            if st.session_state["jobDescriptionUploaded"] == "Pending":
                save_path_jobDescription = os.path.join(
                    cwd, "Data", "JobDescription", uploaded_JobDescription.name
                )

                with open(save_path_jobDescription, mode="wb") as w:
                    w.write(uploaded_JobDescription.getvalue())

                if os.path.exists(save_path_jobDescription):
                    st.toast(
                        f"File {uploaded_JobDescription.name} is successfully saved!",
                        icon="✔️",
                    )
                    update_session_state("jobDescriptionUploaded", "Uploaded")
                    update_session_state("jobDescriptionPath", save_path_jobDescription)
        else:
            update_session_state("jobDescriptionUploaded", "Pending")
            update_session_state("jobDescriptionPath", "")

with st.spinner("Please wait..."):
    if (
        uploaded_Resume is not None
        and st.session_state["jobDescriptionUploaded"] == "Uploaded"
        and uploaded_JobDescription is not None
        and st.session_state["jobDescriptionUploaded"] == "Uploaded"
    ):

        resumeProcessor = ParseResume(read_single_pdf(st.session_state["resumePath"]))
        jobDescriptionProcessor = ParseJobDesc(
            read_single_pdf(st.session_state["jobDescriptionPath"])
        )

        # Resume / JD output
        selected_file = resumeProcessor.get_JSON()
        selected_jd = jobDescriptionProcessor.get_JSON()

        # Add containers for each row to avoid overlap

        # Parsed data
        with st.container():
            resumeCol, jobDescriptionCol = st.columns(2)
            with resumeCol:
                with st.expander("Parsed Resume Data"):
                    st.caption(
                        "This text is parsed from your resume. This is how it'll look like after getting parsed by an "
                        "ATS."
                    )
                    st.caption(
                        "Utilize this to understand how to make your resume ATS friendly."
                    )
                    avs.add_vertical_space(3)
                    st.write(selected_file["clean_data"])

            with jobDescriptionCol:
                with st.expander("Parsed Job Description"):
                    st.caption(
                        "Currently in the pipeline I'm parsing this from PDF but it'll be from txt or copy paste."
                    )
                    avs.add_vertical_space(3)
                    st.write(selected_jd["clean_data"])

        # Extracted keywords
        with st.container():
            resumeCol, jobDescriptionCol = st.columns(2)
            with resumeCol:
                with st.expander("Extracted Keywords"):
                    st.write(
                        "Now let's take a look at the extracted keywords from the resume."
                    )
                    annotated_text(
                        create_annotated_text(
                            selected_file["clean_data"],
                            selected_file["extracted_keywords"],
                            "KW",
                            "#0B666A",
                        )
                    )
            with jobDescriptionCol:
                with st.expander("Extracted Keywords"):
                    st.write(
                        "Now let's take a look at the extracted keywords from the job description."
                    )
                    annotated_text(
                        create_annotated_text(
                            selected_jd["clean_data"],
                            selected_jd["extracted_keywords"],
                            "KW",
                            "#0B666A",
                        )
                    )

        # Star graph visualization
        with st.container():
            resumeCol, jobDescriptionCol = st.columns(2)
            with resumeCol:
                with st.expander("Extracted Entities"):
                    st.write(
                        "Now let's take a look at the extracted entities from the resume."
                    )

                    # Call the function with your data
                    create_star_graph(selected_file["keyterms"], "Entities from Resume")
            with jobDescriptionCol:
                with st.expander("Extracted Entities"):
                    st.write(
                        "Now let's take a look at the extracted entities from the job description."
                    )

                    # Call the function with your data
                    create_star_graph(
                        selected_jd["keyterms"], "Entities from Job Description"
                    )

        # Keywords and values
        with st.container():
            resumeCol, jobDescriptionCol = st.columns(2)
            with resumeCol:
                with st.expander("Keywords & Values"):
                    df1 = pd.DataFrame(
                        selected_file["keyterms"], columns=["keyword", "value"]
                    )

                    # Create the dictionary
                    keyword_dict = {}
                    for keyword, value in selected_file["keyterms"]:
                        keyword_dict[keyword] = value * 100

                    fig = go.Figure(
                        data=[
                            go.Table(
                                header=dict(
                                    values=["Keyword", "Value"],
                                    font=dict(size=12, color="white"),
                                    fill_color="#1d2078",
                                ),
                                cells=dict(
                                    values=[
                                        list(keyword_dict.keys()),
                                        list(keyword_dict.values()),
                                    ],
                                    line_color="darkslategray",
                                    fill_color="#6DA9E4",
                                ),
                            )
                        ]
                    )
                    st.plotly_chart(fig, use_container_width=True)
            with jobDescriptionCol:
                with st.expander("Keywords & Values"):
                    df2 = pd.DataFrame(
                        selected_jd["keyterms"], columns=["keyword", "value"]
                    )

                    # Create the dictionary
                    keyword_dict = {}
                    for keyword, value in selected_jd["keyterms"]:
                        keyword_dict[keyword] = value * 100

                    fig = go.Figure(
                        data=[
                            go.Table(
                                header=dict(
                                    values=["Keyword", "Value"],
                                    font=dict(size=12, color="white"),
                                    fill_color="#1d2078",
                                ),
                                cells=dict(
                                    values=[
                                        list(keyword_dict.keys()),
                                        list(keyword_dict.values()),
                                    ],
                                    line_color="darkslategray",
                                    fill_color="#6DA9E4",
                                ),
                            )
                        ]
                    )
                    st.plotly_chart(fig, use_container_width=True)

        # Treemaps
        with st.container():
            resumeCol, jobDescriptionCol = st.columns(2)
            with resumeCol:
                with st.expander("Key Topics"):
                    fig = px.treemap(
                        df1,
                        path=["keyword"],
                        values="value",
                        color_continuous_scale="Rainbow",
                        title="Key Terms/Topics Extracted from your Resume",
                    )
                    st.plotly_chart(fig, use_container_width=True)

            with jobDescriptionCol:
                with st.expander("Key Topics"):
                    fig = px.treemap(
                        df2,
                        path=["keyword"],
                        values="value",
                        color_continuous_scale="Rainbow",
                        title="Key Terms/Topics Extracted from Job Description",
                    )
                    st.plotly_chart(fig, use_container_width=True)

        avs.add_vertical_space(2)
        st.markdown("#### Similarity Score")
        print("Config file parsed successfully:")
        resume_string = " ".join(selected_file["extracted_keywords"])
        jd_string = " ".join(selected_jd["extracted_keywords"])
        result = get_score(resume_string, jd_string)
        similarity_score = round(result[0].score * 100, 2)

        # Default color to green
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

        avs.add_vertical_space(2)
        with st.expander("Common words between Resume and Job Description:"):
            annotated_text(
                create_annotated_text(
                    selected_file["clean_data"],
                    selected_jd["extracted_keywords"],
                    "JD",
                    "#F24C3D",
                )
            )

st.divider()

# Go back to top
st.markdown("[:arrow_up: Back to Top](#resume-matcher)")
