import streamlit as st
import streamlit.components.v1 as components

def annotated_text(*args):
    """Render text with annotations. Pass tuples (text, annotation, color)"""
    out = ""
    for arg in args:
        if isinstance(arg, tuple):
            text, annotation, color = arg
            color = color or "#faa"
            out += f'<span style="background-color:{color};padding:0.2em 0.3em;border-radius:0.3em;margin:0 0.25em">{text} <span style="opacity:0.6">({annotation})</span></span>'
        else:
            out += str(arg)
    st.markdown(out, unsafe_allow_html=True)