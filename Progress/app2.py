import gensim
import gensim.corpora as corpora
from operator import index
from wordcloud import WordCloud
from pandas._config.config import options
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import Similar

# Reading the CSV files prepared by the fileReader.py
Resumes = pd.read_csv('Resume_data.csv')
Jobs = pd.read_csv('Job_Data.csv')


def get_list_of_words(document):
    Document = []

    for a in document:
        raw = a.split(" ")
        Document.append(raw)

    return Document


document = get_list_of_words(Resumes['Cleaned'])

id2word = corpora.Dictionary(document)
corpus = [id2word.doc2bow(text) for text in document]

lda_model = gensim.models.ldamodel.LdaModel(corpus=corpus, id2word=id2word, num_topics=5, random_state=100,
                                            update_every=1, chunksize=100, passes=50, alpha='auto', per_word_topics=True)


def format_topics_sentences(ldamodel, corpus):
    sent_topics_df = []
    for i, row_list in enumerate(ldamodel[corpus]):
        row = row_list[0] if ldamodel.per_word_topics else row_list
        row = sorted(row, key=lambda x: (x[1]), reverse=True)
        for j, (topic_num, prop_topic) in enumerate(row):
            if j == 0:
                wp = ldamodel.show_topic(topic_num)
                topic_keywords = ", ".join([word for word, prop in wp])
                sent_topics_df.append(
                    [i, int(topic_num), round(prop_topic, 4)*100, topic_keywords])
            else:
                break

    return(sent_topics_df)


df_topic_sents_keywords = format_topics_sentences(
    ldamodel=lda_model, corpus=corpus)
df_some = pd.DataFrame(df_topic_sents_keywords, columns=[
                       'Document No', 'Dominant Topic', 'Topic % Contribution', 'Keywords'])
df_some['Names'] = Resumes['Name']

df = df_some
fig = px.sunburst(df, path=['Dominant Topic', 'Names'], values='Topic % Contribution',
                  color='Dominant Topic', color_continuous_scale='viridis', width=800, height=800, title="LOL XD")
st.write(fig)
# Checking for Multiple Job Descriptions
# If more than one Job Descriptions are available, it asks user to select one as well.
if len(Jobs['Name']) <= 1:
    st.write(
        "There is only 1 Job Description present. It will be used to create scores.")
else:
    st.write("There are ", len(Jobs['Name']),
             "Job Descriptions available. Please select one.")


# Asking to Print the Job Desciption Names
if len(Jobs['Name']) > 1:
    option_yn = st.selectbox(
        "Show the Job Description Names?", options=['NO', 'YES'])
    if option_yn == 'YES':
        index = [a for a in range(len(Jobs['Name']))]
        fig = go.Figure(data=[go.Table(header=dict(values=["Job No.", "Job Desc. Name"], line_color='darkslategray',
                                                   fill_color='lightskyblue'),
                                       cells=dict(values=[index, Jobs['Name']], line_color='darkslategray',
                                                  fill_color='cyan'))
                              ])
        st.write(fig)


# Asking to chose the Job Description
index = st.slider("Which JD to select ? : ", 0,
                  len(Jobs['Name'])-1, 1)


option_yn = st.selectbox("Show the Job Description ?", options=['NO', 'YES'])
if option_yn == 'YES':
    st.markdown("---")
    st.markdown("### Job Description :")
    st.text(Jobs['Context'][index])
    st.markdown("---")


def calculate_scores(resumes, job_description):
    scores = []
    for x in range(resumes.shape[0]):
        score = Similar.match(
            resumes['TF_Based'][x], job_description['Cleaned'][index])
        scores.append(score)
    return scores


Resumes['Scores'] = calculate_scores(Resumes, Jobs)

Ranked_resumes = Resumes.sort_values(
    by=['Scores'], ascending=False).reset_index(drop=True)

Ranked_resumes['Rank'] = pd.DataFrame(
    [i for i in range(1, len(Ranked_resumes['Scores'])+1)])

fig = go.Figure(data=[go.Table(
    header=dict(values=["Rank", "Name", "Scores"],
                fill_color='#00416d',
                align='center', font=dict(color='white', size=16)),
    cells=dict(values=[Ranked_resumes.Rank, Ranked_resumes.Name, Ranked_resumes.Scores],
               fill_color='#d6e0f0',
               align='left'))])

fig.update_layout(title="Top Ranked Resumes", width=700, height=1100)
st.write(fig)

st.markdown("---")

fig = px.bar(Ranked_resumes,
             x=Ranked_resumes['Name'], y=Ranked_resumes['Scores'], color='Scores',
             color_continuous_scale='haline', title="Score and Rank Distribution")
# fig.update_layout(width=700, height=700)
st.write(fig)


st.markdown("---")


def generate_wordcloud(text):
    wordcloud = WordCloud(width=800, height=800,
                          background_color='white',
                          colormap='viridis', collocations=False,
                          min_font_size=10).generate(text)
    plt.figure(figsize=(8, 8), facecolor=None)
    plt.imshow(wordcloud)
    plt.axis("off")
    plt.tight_layout(pad=0)

    plt.show()


option_2 = st.selectbox("Show the Best Matching Resumes?", options=[
    'NO', 'YES'])
if option_2 == 'YES':
    indx = st.slider("Which resume to display ?:",
                     1, Ranked_resumes.shape[0], 1)
    st.write("Displaying Resume with Rank: ", indx)
    st.markdown("---")
    st.markdown("## **Resume** ")
    value = Ranked_resumes.iloc[indx-1, 2]
    st.markdown("#### The Word Cloud For the Resume")
    wordcloud = WordCloud(width=800, height=800,
                          background_color='white',
                          colormap='viridis', collocations=False,
                          min_font_size=10).generate(value)
    plt.figure(figsize=(7, 7), facecolor=None)
    plt.imshow(wordcloud)
    plt.axis("off")
    plt.tight_layout(pad=0)
    st.pyplot()

    st.write("With a Match Score of :", Ranked_resumes.iloc[indx-1, 6])
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
