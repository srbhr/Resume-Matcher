import json
import os
import networkx as nx
import nltk
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from rxconfig import config
import reflex as rx

from annotated_text import annotated_text, parameters
from typing import List
import sys
sys.path.append('../scripts')
from similarity import get_similarity_score, find_path, read_config
# from ..scripts.similarity import get_similarity_score, find_path, read_config
from utils import get_filenames_from_dir

cwd = find_path('Resume-Matcher')
config_path = os.path.join(cwd, "scripts", "similarity")

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
docs_url = "https://reflex.dev/docs/getting-started/introduction"
filename = f"{config.app_name}/{config.app_name}.py"

# class State(rx.State):
#     """The app state."""

#     pass

def read_json(filename):
    print(filename)
    with open(filename) as f:
        data = json.load(f)
    return data

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

def tokenize_string(input_string):
    tokens = nltk.word_tokenize(input_string)
    return tokens

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
    rx.plotly_chart(fig)


resume_names = get_filenames_from_dir("../Data/Processed/Resumes")

# class SelectState(rx.State):
#     option: str = ""
class ResumeState(rx.State):
    path: str = ""
    show: bool = False
    def set_option(self):
        self.option = self.path
        self.show = not self.show
        self.selected_file = read_json("../Data/Processed/Resumes/" + self.option)
        return self.option


def AfterSubmit() -> rx.Component:
    return rx.vstack(
    rx.markdown("#### Parsed Resume Data"),
    rx.text("This text is parsed from your resume. This is how it'll look like after getting parsed by an ATS."),
    rx.text("Utilize this to understand how to make your resume ATS friendly."),)
    

def main_content() -> rx.Component:
    return rx.box(
        rx.image(src="/img/header_image.png"),
        rx.heading("Resume Matcher"),
        rx.markdown("Free and Open Source ATS to help your resume pass the screening stage."),
        rx.markdown("Check the website [www.resumematcher.fyi](https://www.resumematcher.fyi/)"),
        rx.markdown("⭐ Give Resume Matcher a Star on [GitHub](https://github.com/srbhr/resume-matcher)"),
        rx.link("GitHub", href="https://github.com/srbhr/resume-matcher"),  # Replace with appropriate link
        rx.text("For updates follow me on Twitter."),
        rx.link("Twitter", href="_srbhr_"),  # Replace with appropriate link
        rx.markdown("If you like the project and would like to further help in development please consider 👇"),
        rx.link("Buy Me a Coffee", href="srbhr"),  # Replace with appropriate link
        
        
        rx.vstack(
        # rx.heading(SelectState.option),
        
        rx.markdown(f"##### There are {len(resume_names)} resumes present. Please select one from the menu below:"),
        
        rx.select(
            resume_names,
            placeholder="Select a Resume",
            on_change=ResumeState.set_path,
            color_schemes="twitter",
        ),
        rx.button("Submit", on_click=ResumeState.set_option),
        rx.cond(
            ResumeState.show,
            # AfterSubmit(),
            rx.text("selected"),
            rx.text("not selected"),
            
            ),
        width="80%",
        padding_x="2em",
        )
    )

# Define routes for different pages

def index() -> rx.Component:
    return rx.vstack(
        main_content(),
        # grid_template_columns="250px 1fr",
        position="relative",
        height="100%",
        width="100%",
        # padding="1em",
        # background_color="#f0f0f0",
        
    )


# Add state and page to the app.
app = rx.App()
app.add_page(index)
app.compile()

