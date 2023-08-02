import streamlit as st
import pandas as pd
import json
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import pywaffle

st.title('Resume :blue[Matcher]')
st.image('Assets/img/header_image.jpg')
st.subheader('_AI Based Resume Analyzer & Ranker_')


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


def main():
    resume = read_json('Data/Processed/Resume-d531571e-e4fa-45eb-ab6a-267cdeb6647e.json')
    job_desc = read_json('Data/Processed/Job-Desc-a4f06ccb-8d5a-4d0b-9f02-3ba6d686472e.json')

    show_pos(resume)
    show_keyterms(resume)
    show_waffle_chart(resume['keyterms'])
    show_treemap(resume['keyterms'])
    show_n_grams(resume['tri_grams'], 'Tri Grams')
    show_n_grams(resume['bi_grams'], 'Bi Grams')


def show_pos(resume_data):
    st.write("### Reading Resume's POS")
    df = pd.DataFrame(resume_data['pos_frequencies'], index=[0])
    fig = go.Figure(data=go.Bar(y=list(resume_data['pos_frequencies'].values()), x=list(resume_data['pos_frequencies'].keys())),
                    layout_title_text="Resume's POS")
    st.plotly_chart(fig)


def show_keyterms(resume_data):
    df2 = pd.DataFrame(resume_data['keyterms'], columns=["keyword", "value"])
    st.dataframe(df2)
    fig = go.Figure(data=[go.Table(header=dict(values=["Keyword", "Value"],
                                               font=dict(size=12),
                                               fill_color='#070A52'),
                                   cells=dict(values=[list(keyword_dict.keys()),
                                                      list(keyword_dict.values())],
                                              line_color='darkslategray',
                                              fill_color='#6DA9E4'))
                          ])
    st.plotly_chart(fig)


def show_waffle_chart(keyword_dict):
    figure = plt.figure(
        FigureClass=pywaffle.Waffle,
        rows=20,
        columns=20,
        values=keyword_dict,
        legend={'loc': 'upper left', 'bbox_to_anchor': (1, 1)})
    st.pyplot(fig=figure)


def show_treemap(keyword_data):
    df2 = pd.DataFrame(keyword_data, columns=["keyword", "value"])
    fig = px.treemap(df2, path=['keyword'], values='value',
                     color_continuous_scale='RdBu',
                     title='Resume POS')
    st.plotly_chart(fig)


def show_n_grams(n_gram_data, title):
    fig = go.Figure(data=[go.Table(
        header=dict(values=[title],
                    fill_color='#1D267D',
                    align='center', font=dict(color='white', size=16)),
        cells=dict(values=[n_gram_data],
                   fill_color='#19A7CE',
                   align='left'))])
    st.plotly_chart(figure_or_data=fig)


if __name__ == "__main__":
    main()
