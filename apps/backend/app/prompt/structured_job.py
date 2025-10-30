from app.schemas.pydantic.structured_job import RemoteStatusEnum

remote_status_values = ", ".join(e.value for e in RemoteStatusEnum)

PROMPT = """
You are a JSON-extraction engine. Convert the following raw job posting text into exactly the JSON schema below:
— Do not add any extra fields or prose.
— Use “YYYY-MM-DD” for all dates.
— Ensure any URLs (website, applyLink) conform to URI format.
— Do not change the structure or key names; output only valid JSON matching the schema.
— Do not format the response in Markdown or any other format. Just output raw JSON.
— remoteStatus should be the most suited of any of these- ({remote_status_values})

Schema:
```json
{0}
```

Job Posting:
{1}

Note: Please output only a valid JSON matching the EXACT schema with no surrounding commentary.
"""
