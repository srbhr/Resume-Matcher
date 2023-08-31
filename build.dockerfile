FROM python:3.11.0-slim
WORKDIR /data/Resume-Matcher
COPY . .
RUN apt-get update
RUN apt-get install -y build-essential python-dev git
RUN pip install -U pip setuptools wheel
RUN pip install -r requirements.txt
RUN python run_first.py
ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
