[![Resume Matcher + Hacktoberfest](Assets/img/Hacktoberfest_banner.png)](https://github.com/srbhr/Resume-Matcher/issues)

[![Resume Matcher](Assets/img/header_image.png)](https://www.resumematcher.fyi)

<div align="center">

# Resume Matcher

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi) ✦ [𝙳𝚎𝚖𝚘](https://resume-matcher.streamlit.app/) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕 ](#how-to-install) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚎](#join-us-contribute) ✦ [𝙳𝚘𝚗𝚊𝚝𝚎](#please-support-the-development-by-donating) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛](https://twitter.com/_srbhr_)

---


### Resume Matcher is an AI Based Free & Open Source Tool. To tailor your resume to a job description. Find the matching keywords, improve the readability  and gain deep insights into your resume.

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?style=flat-square&color=EA1179)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?style=flat-square&color=525FE1) ![Issues](https://img.shields.io/github/issues/srbhr/Resume-Matcher?style=flat-square&color=F86F03) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?style=flat-square&color=0079FF)

[![Discord](https://custom-icon-badges.demolab.com/badge/Discord-blue?style=flat-square&logo=discord&color=F0FF42&logoColor=293462)](https://discord.gg/t3Y9HEuV34) [![Twitter](https://img.shields.io/badge/@__srbhr__-000000?style=flat-square&logo=x&logoColor=white)](https://twitter.com/_srbhr_)
[![Resume Matcher](https://custom-icon-badges.demolab.com/badge/www.resumematcher.fyi-gold?style=flat-square&logo=globe&logoColor=black)](https://www.resumematcher.fyi)

Upvote us on [ProductHunt 🚀](https://www.producthunt.com/products/resume-matcher).

<a href="https://www.producthunt.com/posts/resume-matcher?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-resume&#0045;matcher" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=401261&theme=light" alt="Resume&#0032;Matcher - Free&#0032;and&#0032;Open&#0045;Source&#0032;ATS&#0032;Tool&#0032;to&#0032;Match&#0032;Resumes&#0032;to&#0032;Job&#0032;Desc&#0046; | Product Hunt" style="width: 180px; height: 50px;" width="200" height="54"/></a>

</div>

<div align="center">

**Don't let your resume be a roadblock from getting your next job. Use Resume Matcher!**

![Resume_Matcher_streamlit_demo](Assets/img/Resume_Matcher_Gif.gif)

## How does it work?

</div>

The Resume Matcher takes your resume and job descriptions as input, parses them using Python, and mimics the functionalities of an ATS, providing you with insights and suggestions to make your resume ATS-friendly.

The process is as follows:

1. **Parsing**: The system uses Python to parse both your resume and the provided job description, just like an ATS would.

2. **Keyword Extraction**: The tool uses advanced machine learning algorithms to extract the most relevant keywords from the job description. These keywords represent the skills, qualifications, and experiences the employer seeks.

3. **Key Terms Extraction**: Beyond keyword extraction, the tool uses textacy to identify the main key terms or themes in the job description. This step helps in understanding the broader context of what the resume is about.

4. **Vector Similarity Using Qdrant**: The tool uses [Qdrant](https://github.com/qdrant/qdrant), a highly efficient vector similarity search tool, to measure how closely your resume matches the job description. The more similar they are, the higher the likelihood that your resume will pass the ATS screening.

<br/>

<div align="center">

## How to install

</div>

Follow these steps to set up the environment and run the application.

1. Fork the repository [here](https://github.com/srbhr/Resume-Matcher/fork).

2. Clone the forked repository.

   ```bash
   git clone https://github.com/<YOUR-USERNAME>/Resume-Matcher.git
   cd Resume-Matcher
   ```

3. Create a Python Virtual Environment:

   - Using [virtualenv](https://learnpython.com/blog/how-to-use-virtualenv-python/):

     _Note_: Check how to install virtualenv on your system here [link](https://learnpython.com/blog/how-to-use-virtualenv-python/).

     ```bash
     virtualenv env
     ```

   **OR**

   - Create a Python Virtual Environment:

     ```bash
     python -m venv env
     ```

4. Activate the Virtual Environment.

   - On Windows.

     ```bash
     env\Scripts\activate
     ```

   - On macOS and Linux.

     ```bash
     source env/bin/activate
     ```

    **OPTIONAL (For pyenv users)**

   Run the application with pyenv (Refer this [article](https://realpython.com/intro-to-pyenv/#installing-pyenv))

   - Build dependencies (on ubuntu)
      ```
      sudo apt-get install -y make build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev libncursesw5-dev xz-utils tk-dev libffi-dev liblzma-dev python openssl
      ```
      ```

      sudo apt-get install build-essential zlib1g-dev libffi-dev libssl-dev libbz2-dev libreadline-dev libsqlite3-dev liblzma-dev libncurses-dev

      sudo apt-get install python-tk python3-tk tk-dev

      sudo apt-get install build-essential zlib1g-dev libffi-dev libssl-dev libbz2-dev libreadline-dev libsqlite3-dev liblzma-dev
      
      ```
   - pyenv installer
     ```
        curl https://pyenv.run | bash
     ```
   - Install desired python version
     ```
       pyenv install -v 3.11.0
     ```
     
   - pyenv with virtual enviroment 
     ```
        pyenv virtualenv 3.11.0 venv
     ```
     
   - Activate virtualenv with pyenv
     ```
        pyenv activate venv
     ```

5. Install Dependencies:

   ```bash
   pip install -r requirements.txt
   ```

6. Prepare Data:

   - Resumes: Place your resumes in PDF format in the `Data/Resumes` folder. Remove any existing contents in this folder.
   - Job Descriptions: Place your job descriptions in PDF format in the `Data/JobDescription` folder. Remove any existing contents in this folder.

7. Parse Resumes to JSON:

   ```python
   python run_first.py
   ```

8. Run the Application:

   ```python
   streamlit run streamlit_app.py
   ```

**Note**: For local versions, you do not need to run "streamlit_second.py" as it is specifically for deploying to Streamlit servers.

**Additional Note**: The Vector Similarity part is precomputed to optimize performance due to the resource-intensive nature of sentence encoders that require significant GPU and RAM resources. If you are interested in leveraging this feature in a Google Colab environment for free, refer to the upcoming blog (link to be provided) for further guidance.

<br/>

### Docker

1. Build the image and start application

   ```bash
       docker-compose up
   ```

2. Open `localhost:80` on your browser

<br/>

### Running the Web Application

The Resume Matcher also includes a full stack web application built with Next.js (React) and FastAPI. This allows users to interact with the Resume Matcher tool interactively via a web browser.

Follow these steps to run the web application:

1. Navigate to the `webapp` directory: cd webapp

2. Install the necessary dependencies: npm install


3. Start the Next.js development server: npm run dev

4. Open your web browser and visit `http://localhost:3000`.

**Note**: Make sure you have Node.js and npm installed on your machine before running these commands. If not, you can download and install them from the [official Node.js website](https://nodejs.org/).

For running the FastAPI server, refer to its specific instructions in the `webapp/README.md` file.



<br/>

### Cohere and Qdrant API Keys

To use the Resume Matcher, you need to obtain API keys from Cohere and Qdrant. Follow the steps below to get these keys:

#### Cohere API Key

1. Visit the [Cohere website registration](https://dashboard.cohere.ai/welcome/register) and create an account.
2. Navigate to the API keys section and copy your Cohere API key.

#### Qdrant API Key
<img src="Assets/img/quadrant_cloud.png" height="60%" width="60%"/>

1. Visit the [Qdrant website](https://cloud.qdrant.io/) and create an account.
2. Copy your Qdrant API key and cluster URL.


#### Adding API Keys to the Project

1. Create a YAML file named `config.yml` in the `Scripts/Similarity/` folder.
2. The format for the config file should be as below:


Now create a yaml file named config.yml in Scripts/Similarity/ folder. 
The format for the conifg file should be as below:
    ```yaml
        cohere:
        api_key: <your_cohere_api_key>
        qdrant:
        api_key: <your_qdrant_api_key>
        url: <your_qdrant_cluster_url>
    ```

Replace `<your_cohere_api_key>`, `<your_qdrant_api_key>`, and `<your_qdrant_cluster_url>` with your actual keys and URL without any quotes.

**Note**: Please make sure that Qdrant_client's version is higher than v1.1.

*Note: Please make sure that Qdrant_client's version is higher than v1.1*

<br/>

<div align="center">

## Join Us, Contribute!

</div>

Pull Requests & Issues are not just welcomed, they're celebrated! Let's create together.

🎉 Join our lively [Discord](https://dsc.gg/resume-matcher) community and discuss away!

💡 Spot a problem? Create an issue!

👩‍💻 Dive in and help resolve existing [issues](https://github.com/srbhr/Resume-Matcher/issues).

🔔 Share your thoughts in our [Discussions & Announcements](https://github.com/srbhr/Resume-Matcher/discussions).

🚀 Explore and improve our [Landing Page](https://github.com/srbhr/website-for-resume-matcher). PRs always welcome!

📚 Contribute to the [Resume Matcher Docs](https://github.com/srbhr/Resume-Matcher-Docs) and help people get started with using the software. 

#### Tech Stack

Current:

- Python webapp in Streamlit.

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&color=blue&logoColor=green)



In Development:

- Check the [webapp](/webapp/) folder for a Next JS app in development. (In Development)

![Python](https://img.shields.io/badge/Python-FFD43B?style=flat-square&logo=python&logoColor=blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white) ![Next JS](https://img.shields.io/badge/Next-black?style=flat-square&logo=next.js&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) ![& More](https://custom-icon-badges.demolab.com/badge/And_More-white?style=flat-square&logo=plus&logoColor=black)

<br/>

<div align="center">

## Please support the development by donating.

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/srbhr)
[![Sponsor on GitHub](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#white)](https://github.com/sponsors/srbhr)

</div>

---

### Heads Up! 📝

Your support means the world to us 💙. We're nurturing this project with an open-source community spirit, and we have an ambitious roadmap ahead! Here are some ways you could contribute and make a significant impact:

✨ Transform our Streamlit dashboard into something more robust.

💡 Improve our parsing algorithm, making data more accessible.

🖋 Share your insights and experiences in a blog post to help others.

Take the leap, contribute, and let's grow together! 🚀

---

### Our Contributors ✨

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>
