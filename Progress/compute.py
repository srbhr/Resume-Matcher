import os
import pandas as pd
import textract as tx
import Similar
import Cleaner


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
    job_desc_dir+job_docs[0], extension='docx', encoding='ascii')
job_desc = str(job_desc, 'utf-8')
job_des = Cleaner.Cleaner(job_desc[0])

scores = []
for text in df['Context']:
    raw = Cleaner.Cleaner(text)
    score = Similar.match(raw[2], job_des[2])
    scores.append(score)

df['Scores'] = scores
df2 = df.sort_values(by=['Scores'], ascending=False)
print(df2.iloc[0, 1])
