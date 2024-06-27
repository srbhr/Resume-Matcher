FROM python:3.11.0-slim
RUN apt-get update && apt-get install -y \
  build-essential \
  git \
  python-dev \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /data/Resume-Matcher
RUN pip install -U pip setuptools wheel
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . .
# debug
RUN pwd && sleep 3
RUN ls -alh Data/Resumes && sleep 5

RUN python run_first.py
ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
