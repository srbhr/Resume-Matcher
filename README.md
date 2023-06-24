[![Resume Matcher](Assets/img/header_image.jpg)](https://www.resumematcher.fyi)

<div align="center">

# Resume Matcher

## AI Based Resume Matcher to tailor your resume to a job description. Find the bestkewords, and gain deep insights into your resume.

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Naive-Resume-Matching?style=for-the-badge)
![](https://img.shields.io/badge/Version-0.0.1--canary-FFD93D?style=for-the-badge) ![Apache 2.0](https://img.shields.io/github/license/srbhr/naive-resume-matching?style=for-the-badge) ![Issues](https://img.shields.io/github/issues/srbhr/Naive-Resume-Matching?style=for-the-badge) ![Forks](https://img.shields.io/github/forks/srbhr/Naive-Resume-Matching?style=for-the-badge)

[![Discord](https://custom-icon-badges.demolab.com/badge/Join%20Discord-blue?style=for-the-badge&logo=discord&logoColor=black)](https://discord.gg/t3Y9HEuV34)

[![Resume Matcher](https://custom-icon-badges.demolab.com/badge/www.resumematcher.fyi-gold?style=for-the-badge&logo=globe&logoColor=black)](https://www.resumematcher.fyi)

</div>

A Machine Learning Based Resume Matcher, to compare Resumes with Job Descriptions.
Create a score based on how good/similar a resume is to the particular Job Description.\n
Documents are sorted based on Their TF-IDF Scores (Term Frequency-Inverse Document Frequency)

Matching Algorihms used are :-

-   **String Matching**

    -   Monge Elkan

-   **Token Based**
    -   Jaccard
    -   Cosine
    -   Sorensen-Dice
    -   Overlap Coefficient

Topic Modelling of Resumes is done to provide additional information about the resumes and what clusters/topics,
the belong to.
For this :-

1. [TF-IDF](https://en.wikipedia.org/wiki/Tf%E2%80%93idf) of resumes is done to improve the sentence similarities. As it helps reduce the redundant terms and brings out the important ones.
2. id2word, and doc2word algorithms are used on the Documents (from Gensim Library).
3. [LDA](https://en.wikipedia.org/wiki/Latent_Dirichlet_allocation) (Latent Dirichlet Allocation) is done to extract the Topics from the Document set.(In this case Resumes)
4. Additional Plots are done to gain more insights about the document.

<br/>

---

### Older Version

Check the older version of the project [**here**](https://github.com/srbhr/Naive-Resume-Matching/blob/master/README.md).
