from typing import List, Optional
from fastapi import File, Form, UploadFile
from pydantic import BaseModel


class Job(BaseModel):
    id: str
    link: Optional[str] = None
    description: Optional[str] = None


class ResumeProcessorRequest(BaseModel):
    resume: UploadFile
    jobs: str

    @classmethod
    def as_form(cls, resume: UploadFile = File(...), jobs: str = Form(...)):
        return cls(resume=resume, jobs=jobs)


class VectorScore(BaseModel):
    jobId: str
    score: int


class CommonWord(BaseModel):
    jobId: str
    text: str


class Changes(BaseModel):
    changeFrom: str
    changeTo: str


class Suggestion(BaseModel):
    jobId: str
    changes: List[Changes]


class ResumeProcessorResponse(BaseModel):
    vectorScoresSet: List[VectorScore]
    commonWordsSet: List[CommonWord]
    suggestionsSet: List[Suggestion]
