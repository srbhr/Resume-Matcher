import random
from fastapi import UploadFile
from typing import List
from ..schemas.resume_processor import (
    ResumeProcessorResponse,
    Job,
    Suggestion,
    VectorScore,
    CommonWord,
    Changes,
)


def build_response(file: UploadFile, jobs: List[Job]) -> ResumeProcessorResponse:
    # Print out the input data (from API request body) for debugging purposes
    print(f"build_response() input > resume: {file.filename}", "\n")
    print(f"build_response() input > jobs: {jobs}", "\n")

    # TEMPORARY: Dynamically (partially) mock the mostly fixed data based on number of jobs data submitted by the user
    # Currently mocked for now, to visualise potential response data model schema for the frontend client UI to process / handle.
    # Will need to be implemented with actual results generated from other scripts... (TBD) 🤓
    vector_scores_set = [
        VectorScore(jobId=job.id, score=random.randint(1, 100)) for job in jobs
    ]

    common_words_set = [
        CommonWord(
            jobId=job.id,
            text="<p>Job Description Senior <span data-highlight>Full Stack Engineer</span> 5+ Years of Experience Tech Solutions San Francisco CA USA. ABout Us Tech Solutions is a ...</p>",
        )
        for job in jobs
    ]

    suggestions_set = [
        Suggestion(
            jobId=job.id,
            changes=[
                Changes(changeFrom="Web Engineer", changeTo="Frontend Developer"),
                Changes(
                    changeFrom="5+ years of experience",
                    changeTo="5+ years of experience with React",
                ),
                Changes(changeFrom="Tech ideas", changeTo="Tech solutions"),
                Changes(
                    changeFrom="unit tested", changeTo="comprehensively unit tested"
                ),
                Changes(
                    changeFrom="worked closely with design team",
                    changeTo="collaborated with design team",
                ),
                Changes(
                    changeFrom="completed solution.",
                    changeTo="successfully delivered solution.",
                ),
            ],
        )
        for job in jobs
    ]

    # Return the response (to be sent back to the API caller)
    return ResumeProcessorResponse(
        vectorScoresSet=vector_scores_set,
        commonWordsSet=common_words_set,
        suggestionsSet=suggestions_set,
    )
