from bs4 import BeautifulSoup
import requests
import easygui
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from os import listdir
from os.path import isfile, join
import logging


'''
This script takes a LinkedIn job posting URL
and converts the description to a PDF file.
The PDF file is saved in the Data/JobDescription folder.
The name will be outputX.pdf, where X is the number of files in the folder.

IMPORTANT: Make sure the URL is to the actuall job description,
and not the job search page.
'''


def split_string(s: str, max_len: int = 82) -> list[str]:
    words = s.split()
    lines = []
    current_line = ""

    for word in words:
        if len(current_line) + len(word) + 1 > max_len:
            lines.append(current_line.strip())
            current_line = ""
        current_line += word + " "

    if current_line:
        lines.append(current_line.strip())

    return lines


def linkedin_to_pdf():
    url = easygui.enterbox("Enter the URL of the LinkedIn Job Posting:")
    try:
        page = requests.get(url)
        content = page.text

        soup = BeautifulSoup(content, "lxml")

        description = (
            soup.find("div", class_="show-more-less-html__markup")
            .get_text(strip=True, separator="\n")
            .split("Primary Location")[0]
            .strip()
        )
        logging.info("Description: \n" + description)

        return save_to_pdf(description)
    except Exception as e:
        logging.error(f"Could not get the description from the URL:\n{url}")
        logging.error(e)
        exit()


def save_to_pdf(description: str):
    job_path = "Data/JobDescription/"
    description = description.split("\n")
    files_number = len([f for f in listdir(job_path) if isfile(join(job_path, f))])
    file_name = f"output{files_number}.pdf"

    c = canvas.Canvas(job_path+file_name, pagesize=letter)

    y = 780
    for value in description:
        value = split_string(value)
        for v in value:
            if y < 20:
                c.showPage()
                y = 780
            c.drawString(72, y, v)
            y -= 20

    c.save()
    logging.info("PDF saved to Data/JobDescription/"+file_name)

    return file_name[:-4]


linkedin_to_pdf()
