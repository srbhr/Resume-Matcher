SCHEMA = {
    "personalInfo": {
        "name": "string",
        "title": "string | null",
        "email": "string",
        "phone": "string",
        "location": "string | null",
        "website": "string | null",
        "linkedin": "string | null",
        "github": "string | null",
    },
    "summary": "string | null",
    "workExperience": [
        {
            "id": 0,
            "title": "string",
            "company": "string | null",
            "location": "string | null",
            "years": "string | null",
            "description": ["string"],
        }
    ],
    "education": [
        {
            "id": 0,
            "institution": "string",
            "degree": "string",
            "years": "string | null",
            "description": "string | null",
        }
    ],
    "personalProjects": [
        {
            "id": 0,
            "name": "string",
            "role": "string | null",
            "years": "string | null",
            "description": ["string"],
        }
    ],
    "additional": {
        "technicalSkills": ["string"],
        "languages": ["string"],
        "certificationsTraining": ["string"],
        "awards": ["string"],
    },
}
