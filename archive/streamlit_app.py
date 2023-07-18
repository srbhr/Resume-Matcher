import string
import spacy
import pywaffle
import streamlit as st
import pandas as pd
import json
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import squarify

st.title('Resume :blue[Matcher]')
st.image('Assets/img/header_image.jpg')
st.subheader('_AI Based Resume Analyzer & Ranker_')


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


# read the json file
resume = read_json(
    'Data/Processed/Resume-d531571e-e4fa-45eb-ab6a-267cdeb6647e.json')
job_desc = read_json(
    'Data/Processed/Job-Desc-a4f06ccb-8d5a-4d0b-9f02-3ba6d686472e.json')

st.write("### Reading Resume's POS")
df = pd.DataFrame(resume['pos_frequencies'], index=[0])
fig = go.Figure(data=go.Bar(y=list(resume['pos_frequencies'].values()), x=list(resume['pos_frequencies'].keys())),
                layout_title_text="Resume's POS")
st.write(fig)

df2 = pd.DataFrame(resume['keyterms'], columns=["keyword", "value"])
st.dataframe(df2)

# Create the dictionary
keyword_dict = {}
for keyword, value in resume['keyterms']:
    keyword_dict[keyword] = value

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

for keyword, value in resume['keyterms']:
    pass


# display the waffle chart
figure = plt.figure(
    FigureClass=pywaffle.Waffle,
    rows=20,
    columns=20,
    values=keyword_dict,
    legend={'loc': 'upper left', 'bbox_to_anchor': (1, 1)})


# Display the dictionary

st.pyplot(fig=figure)
# st.write(dict)

fig = px.treemap(df2, path=['keyword'], values='value',
                 color_continuous_scale='RdBu',
                 title='Resume POS')
st.write(fig)


st.plotly_chart(figure_or_data=fig)

fig = go.Figure(data=[go.Table(
    header=dict(values=["Tri Grams"],
                fill_color='#1D267D',
                align='center', font=dict(color='white', size=16)),
    cells=dict(values=[resume['tri_grams']],
               fill_color='#19A7CE',
               align='left'))])

st.plotly_chart(figure_or_data=fig)

fig = go.Figure(data=[go.Table(
    header=dict(values=["Bi Grams"],
                fill_color='#1D267D',
                align='center', font=dict(color='white', size=16)),
    cells=dict(values=[resume['bi_grams']],
               fill_color='#19A7CE',
               align='left'))])

st.plotly_chart(figure_or_data=fig)


