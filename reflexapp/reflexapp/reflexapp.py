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
    # print(filename)
    try:
        with open(filename) as f:
            data = json.load(f)
    except:
        data = {}
    return data
    

def create_annotated_text(selected_file: dict, annotation: str, color_code: str):
    # Tokenize the input string
    try:
        input_string = str(selected_file["clean_data"])
        word_list = selected_file["extracted_keywords"]
    except Exception as e:
        print(e)
        return [("No data found", "KW", "#0B666A")]
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

def create_star_graph(title)-> rx.Component:
    # Create an empty graph
    
    G = nx.Graph()
    try:
        with open("keyterms.csv") as f:
            data = f.readlines()
        nodes_and_weights = [line.strip().split(",") for line in data]
        for i in range(len(nodes_and_weights)):
            nodes_and_weights[i][1] = float(nodes_and_weights[i][1])
        
    except KeyError:
        return rx.markdown("No data found")
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
    return rx.plotly(data=fig, height="400px")


resume_names = get_filenames_from_dir("../Data/Processed/Resumes")

# class SelectState(rx.State):
#     option: str = ""
class ResumeState(rx.State):
    path: str = ""
    show: bool = False
    selected_file: dict = {}
    extracted_keywords: List[str] = []
    annotated_text: List[str] = []
    # define list of list called keyterms
    keyterms: List[List[str]] = []
    def show_annotation(self):
        if self.path != "":
            return rx.markdown(annotated_text(create_annotated_text(read_json("../Data/Processed/Resumes/" + self.path), "KW", "#0B666A")))
    def set_option(self):
        if self.path != "":
            self.show = True
            # print(self.path)
            self.selected_file = read_json("../Data/Processed/Resumes/" + self.path)
            self.annotated_text = annotated_text(create_annotated_text(self.selected_file, "KW", "#0B666A"))
            # print("printing annotated text ", self.annotated_text)
            # write the annotated text to a file
            with open("xyz.txt", "w") as f:
                f.write(self.annotated_text[0])
            # write keyterms to a csv file
            with open("keyterms.csv", "w+") as f:
                for keyterm in self.selected_file["keyterms"]:
                    f.write(keyterm[0] + "," + str(keyterm[1]) + "\n")
            self.keyterms = self.selected_file["keyterms"]
            self.extracted_keywords = self.selected_file["extracted_keywords"]
            # print(type(self.selected_file), self.selected_file)

def display_keywords() -> rx.Component:
    with open("xyz.txt", "r") as f:
        print("here")
        annotated_text = f.read()
    return rx.markdown(annotated_text)
    
def AfterSubmit() -> rx.Component:
    return rx.vstack(
        rx.markdown("# Parsed Resume Data"),
        rx.text("This text is parsed from your resume. This is how it'll look like after getting parsed by an ATS."),
        rx.text("Utilize this to understand how to make your resume ATS friendly."),
        rx.markdown("## Resume Text"),
        rx.markdown(ResumeState.selected_file["clean_data"]),
        rx.text(""),
        rx.text(""),
        rx.text(""),
        rx.text("Now let's take a look at the keywords that are present in your resume."),
        rx.text(""),
        display_keywords(),
        rx.text(""),
        rx.text(""),
        rx.text("Now let's take a look at the extracted entities from the resume."),
        create_star_graph("Extracted Entities"),
        # rx.markdown(annotated_text(create_annotated_text(read_json("../Data/Processed/Resumes/" + ResumeState.path), "KW", "#0B666A"))[0]),
    )
    

def main_content() -> rx.Component:
    return rx.box(
        rx.image(src="/header_image.png"),
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
            AfterSubmit(),
            # rx.text("selected"),
            rx.text(""),
            
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

