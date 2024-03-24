FROM python:3.11-slim-bullseye

WORKDIR /data/Resume-Matcher
COPY . .

RUN pip install -r requirements.txt
RUN python run_first.py

ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
