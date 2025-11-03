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
        "remoteStatus": "Not Specified",  # IMPORTANT: choose EXACTLY ONE of:
                                  # "Fully Remote", "Hybrid", "On-site",
                                  # "Remote", "Not Specified", "Multiple Locations"
    },
    "datePosted": "YYYY-MM-DD",
    "employmentType": "Full-time | Full time | Part-time | Part time | Contract | Internship | Temporary | Not Specified",
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
