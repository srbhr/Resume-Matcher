import logging #logging module for logging messages
from os import listdir #listdir function from o module for lostong directory contents
from os.path import isfile, join #isfile and join functions from os.path module

import easygui #used for creating GUI dialogs
import requests #requests library for making HTTP requests
from bs4 import BeautifulSoup #used for HTML parsing
from pathvalidate import sanitize_filename #import sanitize_filename from pathvalidate
from xhtml2pdf import pisa #import pisa from xhtml2pdf for converting HTML to pdf

"""
This script takes a LinkedIn job posting URL
and converts the description to a PDF file.
The PDF file is saved in the Data/JobDescription folder.
The name will be OrgName__Job Title_X.pdf, where X is the number of files in the folder.

IMPORTANT: Make sure the URL is to the actual job description,
and not the job search page.
"""


def linkedin_to_pdf(job_url: str):

    job_path = "Data/JobDescription/" #define directory path where PDF files will be saved
    job_description = "" #initialize an empty string to store the job description
    files_number = len([f for f in listdir(job_path) if isfile(join(job_path, f))])  #count the number of files in the job_path directory
    """
    what does the isfile function do?
        it is used to check whether a given path refers to a refular file.
        it returns True if the path refers to a regular file and points to it, False otherwise.

    """

    try:
        page = requests.get(job_url) #send a GET request to retrieve the job posting page

        if page.status_code != 200:#check if the request was successful (status code 200)
            print(
                f"Failed to retrieve the job posting at {job_url}. Status code: {page.status_code}"
            )
            return

        # Parse the HTML content of the job posting using BeautifulSoup
        soup = BeautifulSoup(page.text, "html.parser")

        # Find the job title element and get the text
        job_title = soup.find("h1", {"class": "topcard__title"}).text.strip()

        # Find the organization name element (try both selectors)
        organization_element = soup.find("span", {"class": "topcard__flavor"})

        if not organization_element:
            organization_element = soup.find("a", {"class": "topcard__org-name-link"})

        # Extract the organization name
        organization = organization_element.text.strip()

        # Find the job description element
        job_description_element = soup.find(
            "div", {"class": "show-more-less-html__markup"}
        )

        # Extract the job description and concatenate its elements
        if job_description_element:
            for element in job_description_element.contents:
                job_description += str(element)

        # Set file_path and sanitize organization name and job title
        file_path = f"{job_path}{sanitize_filename(organization + '__' + job_title)}_{files_number}.pdf"

        # Create a PDF file and write the job description to it
        with open(file_path, "wb") as pdf_file:
            pisa.CreatePDF(job_description, dest=pdf_file, encoding="utf-8")

        logging.info("PDF saved to " + file_path)

    except Exception as e:
        logging.error(f"Could not get the description from the URL: {job_url}")
        logging.error(e)
        exit()


if __name__ == "__main__":
    #prompt the user to enter the URL of the LinkedIn job posting 
    url = easygui.enterbox("Enter the URL of the LinkedIn Job Posting:").strip()
    linkedin_to_pdf(url) #call linkedin_to_pdf function with the entered URL
