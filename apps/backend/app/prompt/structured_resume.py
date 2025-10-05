PROMPT = """
You are a JSON extraction engine. Convert the following resume text into precisely the JSON schema specified below.
- Do not compose any extra fields or commentary.
- Do not make up values for any fields.
- Use "Present" if an end date is ongoing.
- Make sure dates are in YYYY-MM-DD.
- Do not format the response in Markdown or any other format. Just output raw JSON.
- All values must be derived solely from the Resume text; never infer, guess, or fabricate information.
- For any field that cannot be filled from the Resume, output null or an empty value if the schema permits it.
- Ensure every field matches the type defined in the schema (strings, numbers, arrays, or objects). Dates must be ISO strings.

Schema:
```json
{0}
```

Resume:
```text
{1}
```

NOTE: Output only a single JSON object that matches the EXACT schema, with no extra keys, commentary, or formatting.
"""
