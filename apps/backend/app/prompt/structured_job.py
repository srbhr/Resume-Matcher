import textwrap

PROMPT = textwrap.dedent("""\
You are a JSON extraction engine. Your task is to convert the raw job posting text below into valid JSON that matches the exact schema provided.

Instructions:
1. Extract only the information required by the schema.
2. Use the exact structure and key names from the schema—do not modify them.
3. Format all dates using "YYYY-MM-DD".
4. Ensure all URLs (e.g., website, applyLink) are valid URI strings.
5. Output only raw JSON—no prose, no Markdown, no commentary, and no extra fields.

Schema:
{0}

Job Posting:
{1}

Reminder: Your response must be valid JSON matching the exact schema above, with no additional text or formatting.
""")
