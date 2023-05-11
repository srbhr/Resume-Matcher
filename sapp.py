import pywaffle
import streamlit as st
import pandas as pd
import json
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import squarify

st.write("""
    # Resume Ranker
""")


st.write("### Reading Resume.json")


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


# read the json file
resume = read_json('resume.json')
st.write(resume)

pos_frequencies = resume['pos_frequencies']
st.write(pos_frequencies)

st.write("### Reading Resume's POS")
df = pd.DataFrame(pos_frequencies, index=[0])
st.write(df)

# st.write(df[])

fig = go.Figure(data=go.Bar(y=list(pos_frequencies.values()), x=list(pos_frequencies.keys())),
                layout_title_text="Resume's POS")
st.write(fig)


# Load the data
data = [
    [
        "Machine Learning Engineer",
        0.5335097455348873
    ],
    [
        "Senior Python",
        0.07630503987890255
    ],
    [
        "Python developer",
        0.05873499396464859
    ],
    [
        "quality software",
        0.01990980007696967
    ],
    [
        "complex problem",
        0.019703048817505984
    ],
    [
        "budget skilled",
        0.01913837609720131
    ],
    [
        "efficient system",
        0.018581718435828593
    ],
    [
        "high quality",
        0.0180594642212853
    ],
    [
        "John Smith",
        0.013905415715885792
    ],
    [
        "real time",
        0.01149314646193105
    ],
    [
        "machine",
        0.006960115529773619
    ],
    [
        "scalable",
        0.004996462903332193
    ],
    [
        "AWS",
        0.004328224257667386
    ],
    [
        "model",
        0.00287489326728256
    ],
    [
        "computing",
        0.0028240462859907504
    ],
    [
        "position",
        0.0028079647089921905
    ],
    [
        "cloud",
        0.002781530860197175
    ],
    [
        "analysis",
        0.0027801963076884476
    ],
    [
        "Company",
        0.002773700113337694
    ],
    [
        "challenging",
        0.0027638705911412808
    ]
]

# # Create the waffle chart


# # Display the waffle chart
# st.write(waffle.show())

df2 = pd.DataFrame(data, columns=["keyword", "value"])
st.write(df2)

# Create the dictionary
keyword_dict = {}
for keyword, value in data:
    keyword_dict[keyword] = value

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


fig = go.Figure(data=[go.Table(
    header=dict(values=["Resume"],
                fill_color='#1D267D',
                align='center', font=dict(color='white', size=16)),
    cells=dict(values=[resume['resume_data']],
               fill_color='#19A7CE',
               align='left'))])

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
