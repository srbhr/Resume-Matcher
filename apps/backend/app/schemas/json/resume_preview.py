SCHEMA = {
    "personalInfo": {
        "name": "string",
        "title": "string",
        "email": "string",
        "phone": "string",
        "location": "string | null",
        "website": "string | null",
        "linkedin": "string | null",
        "github": "string | null",
    },
    "summary": "string | null",
    "experience": [
        {
            "id": 0,
            "title": "string",
            "company": "string",
            "location": "string",
            "years": "string",
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
    "skills": ["string"],
}
