import Cleaner
import Similar
import textract as tx
import pandas as pd
import os
import streamlit as st

st.title("Naive Resume Matcher")
st.markdown(""" ### Ranking **Resumes** based on the Matching Skills as provided by the required job description. This uses a **Token, String and Word Embedding** based algorithm created to generate a match score that ranks a resume.""")


resume_dir = "Data/Resumes/"
job_desc_dir = "Data/JobDesc/"
resume_names = os.listdir(resume_dir)
document = []

for res in resume_names:
    temp = []
    temp.append(res)
    text = tx.process(resume_dir+res, encoding='ascii')
    text = str(text, 'utf-8')
    temp.append(text)
    document.append(temp)

df = pd.DataFrame(document, columns=['Name', 'Context'])

# Only one Job Description should be present and in docx format
job_docs = os.listdir(job_desc_dir)
job_desc = tx.process(
    job_desc_dir+job_docs[1], extension='docx', encoding='ascii')
job_desc = str(job_desc, 'utf-8')
job_des = Cleaner.Cleaner(job_desc)

st.subheader("Job Description")
st.markdown(" --- ")
st.write(job_desc)
st.markdown(" --- ")

scores = []
for text in df['Context']:
    raw = Cleaner.Cleaner(text)
    score = Similar.match(raw[2], job_des[2])
    scores.append(score)
st.write(scores)
df['Scores'] = scores

st.dataframe(df)
df2 = df.sort_values(by=['Scores'], ascending=False)
st.dataframe(df2)
print(df2.iloc[0, 1])
