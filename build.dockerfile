FROM python:3.11-slim-bullseye

WORKDIR /data/Resume-Matcher
RUN apt-get update
RUN apt-get install -y build-essential python-dev git
RUN pip install -U pip setuptools wheel
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
RUN python run_first.py
ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]