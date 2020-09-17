![Naive Resume Matcher Logo](Images/logo.png)

# Naive-Resume-Matcher

A Machine Learning Based Resume Matcher, to compare Resumes with Job Descriptions.
Create a score based on how good/similar a resume is to the particular Job Description.\n
Documents are sorted based on Their TF-IDF Scores (Term Frequency-Inverse Document Frequency)

Matching Algorihms used are :-

- **String Matching**

  - Monge Elkan

- **Token Based**
  - Jaccard
  - Cosine
  - Sorensen-Dice
  - Overlap Coefficient

Topic Modelling of Resumes is done to provide additional information about the resumes and what clusters/topics,
the belong to.
For this :-

1. [TF-IDF](https://en.wikipedia.org/wiki/Tf%E2%80%93idf) of resumes is done to improve the sentence similarities. As it helps reduce the redundant terms and brings out the important ones.
2. id2word, and doc2word algorithms are used on the Documents (from Gensim Library).
3. [LDA](https://en.wikipedia.org/wiki/Latent_Dirichlet_allocation) (Latent Dirichlet Allocation) is done to extract the Topics from the Document set.(In this case Resumes)
4. Additional Plots are done to gain more insights about the document.

---

## Progress Flow

1. Input is Resumes and Job Description, the current code is capable to compare resumes to multiple job descriptions.
2. Job Description and Resumes are parsed with the help of Tesseract Library in python, and then is converted into two CSV files.Namely `Resume_Data.csv`and`Job_Data.csv`.
3. While doing the reading, the python script named [fileReader.py](fileReader.py) reads, and cleans the code and does the TF-IDF based filtering as well. (This might take sometime to process, so please be patient while executing the script.)
4. For any further comparisons the prepared CSV files are used.
5. [app.py](app.py) containg the code for running the streamlit server and allowing to perform tasks. Use `streamlit run app.py` to execute the script.

## File Structure

#### Data > Resumes and > JobDescription

The Data folder contains two folders that are used to read and provide data from.
Incase of allowing the option to upload documents, `Data\Resumes` and `Data\JobDesc` should be the target for Resumes and Job Description respectively.

Due the flexibility of Tesseract we need not to provide the type of document it needs to scan, it does so automatically.

But for the Job Description it needs to be in Docx format, it can be changed as well.
