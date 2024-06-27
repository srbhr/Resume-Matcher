FROM python:3.11.0-slim
RUN apt-get update
RUN apt-get install -y build-essential python-dev git
WORKDIR /data/Resume-Matcher
RUN pip install -U pip setuptools wheel
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . /data/Resume-Matcher/
# debug
RUN pwd && sleep 3
RUN ls -alh Data/Resumes && sleep 5

RUN python run_first.py
ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
