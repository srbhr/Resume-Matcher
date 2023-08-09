FROM python:3.11.0-slim

RUN pip install --upgrade pip

ENV POETRY_HOME=/poetry

RUN pip install poetry

ENV PATH="/poetry/bin:${PATH}"

RUN poetry --version

WORKDIR /data

RUN apt-get update

RUN apt-get install -y build-essential python-dev git

RUN pip install -U pip setuptools wheel

COPY pyproject.toml ./
COPY poetry.lock ./

RUN poetry config virtualenvs.create false \
    && poetry install

COPY . .

RUN python run_first.py

ENTRYPOINT [ "streamlit", "run", "streamlit_app.py"]

EXPOSE 8501
