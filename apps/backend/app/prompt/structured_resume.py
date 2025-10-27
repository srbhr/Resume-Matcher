PROMPT = """
You are a JSON extraction engine. Convert the following resume text into precisely the JSON schema specified below.
- Map each resume section to the schema without inventing information.
- If a field is missing in the source text, use an empty string or empty list as appropriate.
- Preserve bullet points in the `description` arrays using short factual sentences.
- Use "Present" if an end date is ongoing and prefer YYYY-MM-DD where dates are available.
- Keep the `additional` section organised: list technical skills, languages, certifications/training, and awards exactly as they appear.
- Do not compose any extra fields or commentary and output raw JSON only (no Markdown, no prose).

Schema:
```json
{0}
```

Resume:
```text
{1}
```

NOTE: Please output only a valid JSON matching the EXACT schema.
"""
