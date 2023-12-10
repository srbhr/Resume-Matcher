FROM python:3.11.0-slim
WORKDIR /data/Resume-Matcher
RUN apt-get update
RUN apt-get install -y build-essential python-dev git
RUN pip install -U pip setuptools wheel

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY Data ./Data
COPY __init__.py .
COPY scripts ./scripts
COPY run_first.py ./
RUN python run_first.py

COPY . .

ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
