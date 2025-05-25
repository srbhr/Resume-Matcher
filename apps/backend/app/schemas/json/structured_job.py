SCHEMA = {
    "jobId": "string",
    "jobTitle": "string",
    "companyProfile": {
        "companyName": "string",
        "industry": "Optional[string]",
        "website": "Optional[string]",
        "description": "Optional[string]",
    },
    "location": {
        "city": "string",
        "state": "string",
        "country": "string",
        "remoteStatus": "string",
    },
    "datePosted": "YYYY-MM-DD",
    "employmentType": "string",
    "jobSummary": "string",
    "keyResponsibilities": [
        "string",
        "...",
    ],
    "qualifications": {
        "required": [
            "string",
            "...",
        ],
        "preferred": [
            "string",
            "...",
        ],
    },
    "compensationAndBenefits": {
        "salaryRange": "string",
        "benefits": [
            "string",
            "...",
        ],
    },
    "applicationInfo": {
        "howToApply": "string",
        "applyLink": "string",
        "contactEmail": "Optional[string]",
    },
    "extractedKeywords": [
        "string",
        "...",
    ],
}
