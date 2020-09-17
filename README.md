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

1. LSA (Latenet Semantic Analysis) (aka TruncatedSVD in sklearn) is done after TF-IDF.
2. id2word, and doc2word algorithms are used on the Documents.
3. LDA or Latent Dirichlet Allocation is done to extract the Topics from the Document set.(In this case Resumes)
4. Additional Plots are done to gain more insights about the document.
