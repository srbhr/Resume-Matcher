import streamlit as st
import pandas as pd
import json

st.write("""
    # Resume Ranker
""")


st.write("## Reading Resume.json")


def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data


# read the json file
df = read_json('resume.json')
st.write(df)
