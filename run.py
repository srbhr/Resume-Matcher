from ParseResumeToJson import ParseResume
from readpdf import read_single_pdf
data = read_single_pdf('resume_1.pdf')
output = ParseResume(data[0]).get_JSON()
print(output)
