from wordcloud import STOPWORDS
from operator import index
from wordcloud import WordCloud
from pandas._config.config import options
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt

st.title("Naive Resume Matcher")
st.markdown("""
A Machine Learning Based Resume Matcher, to compare Resumes with Job Descriptions.
Create a score based on how good/similar a resume is to the particular Job Description.\n
Algorihms used:-
- **String Matching**
    - Monge Elkan

- **Token Based**
    - Jaccard
    - Cosine
    - Sorensen-Dice
    - Overlap Coefficient

Total Score calculate is the overall average of the 4 mentioned token based algorithms and string based.
""")


# to read all the resumes in the directory as provided by the user

if len(job_description_names) <= 1:
    st.write("There is only ", len(job_description_names),
             "present. It will be used to create scores.")
else:
    st.write("There are ", len(job_description_names),
             "Job Descriptions available. Please select one.")
if len(job_description_names) > 1:
    option_yn = st.selectbox(
        "Show the Job Description Names?", options=['NO', 'YES'])
    if option_yn == 'YES':
        st.write(job_description_names)


index = st.slider("Which JD to select ? : ", 0,
                  len(job_description_names)-1, 1)


job = read_job_description(index, job_description_names, job_desc_dir)

option_yn = st.selectbox("Show the Job Description ?", options=['NO', 'YES'])
if option_yn == 'YES':
    st.markdown("---")
    st.markdown("### Job Description :")
    st.text(job[0])
    st.markdown("---")


def get_cleaned_data(resumes):
    data = []
    for text in resumes:
        raw = Cleaner.Cleaner(text)
        data.append(raw)
    return data


cleaned_data = get_cleaned_data(df['Context'])

cleaned_df = pd.DataFrame(cleaned_data, columns=[
                          'Cleaned', 'Selective', 'Selective Reduced'])


def calculate_scores(resumes, job_description, x=2, y=2):
    scores = []
    for text in resumes:
        raw = Cleaner.Cleaner(text)
        score = Similar.match(raw[x], job_description[y])
        scores.append(score)
    return scores


df['Scores'] = calculate_scores(df['Context'], job[1])

df_sorted = df.sort_values(
    by=['Scores'], ascending=False).reset_index(drop=True)

df_sorted['Rank'] = pd.DataFrame(
    [i for i in range(1, len(df_sorted['Scores'])+1)])

fig = go.Figure(data=[go.Table(
    header=dict(values=["Rank", "Name", "Scores"],
                fill_color='#00416d',
                align='center', font=dict(color='white', size=16)),
    cells=dict(values=[df_sorted.Rank, df_sorted.Name, df_sorted.Scores],
               fill_color='#d6e0f0',
               align='left'))])

fig.update_layout(width=700, height=1200)
st.write(fig)
# st.dataframe(df_sorted)

fig = px.bar(df_sorted, x=df_sorted['Name'], y=df_sorted['Scores'])
# fig.update_layout(width=700, height=700)
st.write(fig)


def get_text_from_df(df_iter):
    output = " "
    for _ in df_iter:
        output += str(_)
        return output


option_2 = st.selectbox("Show the Best Matching Resumes?", options=[
    'NO', 'YES'])


if option_2 == 'YES':
    indx = st.slider("Which resume to display ?:", 1, len(resume_names), 1)
    st.write("Displaying Resume with Rank: ", indx)
    st.markdown("---")
    st.markdown("### Resume :")
    value = df_sorted.iloc[indx-1, 1]
    st.write("With a Match Score of :", df_sorted.iloc[indx-1, 2])
    fig = go.Figure(data=[go.Table(
        header=dict(values=["Resume"],
                    fill_color='#f0a500',
                    align='center', font=dict(color='white', size=16)),
        cells=dict(values=[str(value)],
                   fill_color='#f4f4f4',
                   align='left'))])

    fig.update_layout(width=800, height=1200)
    st.write(fig)
    # st.text(df_sorted.iloc[indx-1, 1])
    st.markdown("---")
