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

from scripts.similarity import get_similarity_score, find_path, read_config
from scripts.utils import get_filenames_from_dir

cwd = find_path('Resume-Matcher')
config_path = os.path.join(cwd, "scripts", "similarity")

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

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

    edge_trace = go.Scatter(x=edge_x, y=edge_y, line=dict(
        width=0.5, color='#888'), hoverinfo='none', mode='lines')

    # Create node trace
    node_x = []
    node_y = []
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)

    node_trace = go.Scatter(x=node_x, y=node_y, mode='markers', hoverinfo='text',
                            marker=dict(showscale=True, colorscale='Rainbow', reversescale=True, color=[], size=10,
                                        colorbar=dict(thickness=15, title='Node Connections', xanchor='left',
                                                      titleside='right'), line_width=2))

    # Color node points by number of connections
    node_adjacencies = []
    node_text = []
    for node in G.nodes():
        adjacencies = list(G.adj[node])  # changes here
        node_adjacencies.append(len(adjacencies))
        node_text.append(f'{node}<br># of connections: {len(adjacencies)}')

    node_trace.marker.color = node_adjacencies
    node_trace.text = node_text

    # Create the figure
    fig = go.Figure(data=[edge_trace, node_trace],
                    layout=go.Layout(title=title, titlefont_size=16, showlegend=False,
                                     hovermode='closest', margin=dict(b=20, l=5, r=5, t=40),
                                     xaxis=dict(
                                         showgrid=False, zeroline=False, showticklabels=False),
                                     yaxis=dict(showgrid=False, zeroline=False, showticklabels=False)))

    # Show the figure
    st.plotly_chart(fig)


def create_annotated_text(input_string: str, word_list: List[str], annotation: str, color_code: str):
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


st.image('Assets/img/header_image.png')

st.title(':blue[Resume Matcher]')
st.subheader(
    'Free and Open Source ATS to help your resume pass the screening stage.')
st.markdown(
    "Check the website [www.resumematcher.fyi](https://www.resumematcher.fyi/)")
st.markdown(
    '⭐ Give Resume Matcher a Star on [GitHub](https://github.com/srbhr/resume-matcher)')
badge(type="github", name="srbhr/Resume-Matcher")

st.text('For updates follow me on Twitter.')
badge(type="twitter", name="_srbhr_")

st.markdown(
    'If you like the project and would like to further help in development please consider 👇')
badge(type="buymeacoffee", name="srbhr")

avs.add_vertical_space(5)

resume_names = get_filenames_from_dir("Data/Processed/Resumes")


st.markdown(f"##### There are {len(resume_names)} resumes present. Please select one from the menu below:")
output  = st.selectbox(f"", resume_names)
    


avs.add_vertical_space(5)

# st.write("You have selected ", output, " printing the resume")
selected_file = read_json("Data/Processed/Resumes/" + output)

avs.add_vertical_space(2)
st.markdown("#### Parsed Resume Data")
st.caption(
    "This text is parsed from your resume. This is how it'll look like after getting parsed by an ATS.")
st.caption("Utilize this to understand how to make your resume ATS friendly.")
avs.add_vertical_space(3)
# st.json(selected_file)
st.write(selected_file["clean_data"])

avs.add_vertical_space(3)
st.write("Now let's take a look at the extracted keywords from the resume.")

annotated_text(create_annotated_text(
    selected_file["clean_data"], selected_file["extracted_keywords"],
    "KW", "#0B666A"))

avs.add_vertical_space(5)
st.write("Now let's take a look at the extracted entities from the resume.")

# Call the function with your data
create_star_graph(selected_file['keyterms'], "Entities from Resume")

df2 = pd.DataFrame(selected_file['keyterms'], columns=["keyword", "value"])

# Create the dictionary
keyword_dict = {}
for keyword, value in selected_file['keyterms']:
    keyword_dict[keyword] = value * 100

fig = go.Figure(data=[go.Table(header=dict(values=["Keyword", "Value"],
                                           font=dict(size=12),
                                           fill_color='#070A52'),
                               cells=dict(values=[list(keyword_dict.keys()),
                                                  list(keyword_dict.values())],
                                          line_color='darkslategray',
                                          fill_color='#6DA9E4'))
                      ])
st.plotly_chart(fig)

st.divider()

fig = px.treemap(df2, path=['keyword'], values='value',
                 color_continuous_scale='Rainbow',
                 title='Key Terms/Topics Extracted from your Resume')
st.write(fig)

avs.add_vertical_space(5)

job_descriptions = get_filenames_from_dir("Data/Processed/JobDescription")


st.markdown(f"##### There are {len(job_descriptions)} job descriptions present. Please select one from the menu below:")
output = st.selectbox("", job_descriptions)


avs.add_vertical_space(5)

selected_jd = read_json(
    "Data/Processed/JobDescription/" + output)

avs.add_vertical_space(2)
st.markdown("#### Job Description")
st.caption(
    "Currently in the pipeline I'm parsing this from PDF but it'll be from txt or copy paste.")
avs.add_vertical_space(3)
# st.json(selected_file)
st.write(selected_jd["clean_data"])

st.markdown("#### Common Words between Job Description and Resumes Highlighted.")

annotated_text(create_annotated_text(
    selected_file["clean_data"], selected_jd["extracted_keywords"],
    "JD", "#F24C3D"))

st.write("Now let's take a look at the extracted entities from the job description.")

# Call the function with your data
create_star_graph(selected_jd['keyterms'], "Entities from Job Description")

df2 = pd.DataFrame(selected_jd['keyterms'], columns=["keyword", "value"])

# Create the dictionary
keyword_dict = {}
for keyword, value in selected_jd['keyterms']:
    keyword_dict[keyword] = value * 100

fig = go.Figure(data=[go.Table(header=dict(values=["Keyword", "Value"],
                                           font=dict(size=12),
                                           fill_color='#070A52'),
                               cells=dict(values=[list(keyword_dict.keys()),
                                                  list(keyword_dict.values())],
                                          line_color='darkslategray',
                                          fill_color='#6DA9E4'))
                      ])
st.plotly_chart(fig)

st.divider()

fig = px.treemap(df2, path=['keyword'], values='value',
                 color_continuous_scale='Rainbow',
                 title='Key Terms/Topics Extracted from the selected Job Description')
st.write(fig)

avs.add_vertical_space(3)

config_file_path = config_path + "/config.yml"
if os.path.exists(config_file_path):
    config_data = read_config(config_file_path)
    if config_data:
        print("Config file parsed successfully:")
        resume_string = ' '.join(selected_file["extracted_keywords"])
        jd_string = ' '.join(selected_jd["extracted_keywords"])
        result = get_similarity_score(resume_string, jd_string)
        similarity_score = result[0]["score"]
        st.write("Similarity Score obtained for the resume and job description is:", similarity_score)
else:
    print("Config file does not exist.")


st.title(':blue[Resume Matcher]')
st.subheader(
    'Free and Open Source ATS to help your resume pass the screening stage.')
st.markdown(
    '⭐ Give Resume Matcher a Star on [GitHub](https://github.com/srbhr/Resume-Matcher/)')
badge(type="github", name="srbhr/Resume-Matcher")

st.text('For updates follow me on Twitter.')
badge(type="twitter", name="_srbhr_")

st.markdown(
    'If you like the project and would like to further help in development please consider 👇')
badge(type="buymeacoffee", name="srbhr")
