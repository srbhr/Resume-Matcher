"""One-off data migration: SQLite -> Postgres/Neon.

Notes:
- Adjust SOURCE_SQLITE and TARGET_PG from env vars.
- Idempotent inserts via ON CONFLICT for natural keys where available.
- Only migrates known tables (resumes, jobs, processed_resumes, processed_jobs, llm_cache, llm_cache_index).

Usage (PowerShell):
  Set-Location apps/backend
  $env:SOURCE_SQLITE="app.db"
  $env:TARGET_PG="postgresql://app_user:PASSWORD@ep-XYZ.eu-central-1.aws.neon.tech/neondb?sslmode=require"
  python scripts/sqlite_to_postgres_migrate.py
"""
from __future__ import annotations

import os
import sqlite3
import psycopg
from contextlib import closing

SRC = os.environ.get("SOURCE_SQLITE", "app.db")
DST = os.environ.get("TARGET_PG")
if not DST:
    raise SystemExit("Set TARGET_PG to your Postgres connection string")


def copy_resumes(curS, curD):
    for row in curS.execute(
        "SELECT resume_id, content, content_type, created_at, content_hash FROM resumes"
    ):
        curD.execute(
            """
            INSERT INTO resumes (resume_id, content, content_type, created_at, content_hash)
            VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT (resume_id) DO NOTHING
            """,
            row,
        )


def copy_jobs(curS, curD):
    for row in curS.execute(
        "SELECT job_id, resume_id, content, created_at FROM jobs"
    ):
        curD.execute(
            """
            INSERT INTO jobs (job_id, resume_id, content, created_at)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (job_id) DO NOTHING
            """,
            row,
        )


def copy_processed_resumes(curS, curD):
    for row in curS.execute(
        """
        SELECT resume_id, personal_data, experiences, projects, skills, research_work,
               achievements, education, extracted_keywords, processed_at
        FROM processed_resumes
        """
    ):
        curD.execute(
            """
            INSERT INTO processed_resumes (
              resume_id, personal_data, experiences, projects, skills, research_work,
              achievements, education, extracted_keywords, processed_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (resume_id) DO NOTHING
            """,
            row,
        )


def copy_processed_jobs(curS, curD):
    for row in curS.execute(
        """
        SELECT job_id, job_title, company_profile, location, date_posted,
               employment_type, job_summary, key_responsibilities, qualifications,
               compensation_and_benfits, application_info, extracted_keywords, processed_at
        FROM processed_jobs
        """
    ):
        curD.execute(
            """
            INSERT INTO processed_jobs (
              job_id, job_title, company_profile, location, date_posted,
              employment_type, job_summary, key_responsibilities, qualifications,
              compensation_and_benfits, application_info, extracted_keywords, processed_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (job_id) DO NOTHING
            """,
            row,
        )


def copy_llm_cache(curS, curD):
    for row in curS.execute(
        "SELECT cache_key, model, strategy, prompt_hash, response_json, tokens_in, tokens_out, ttl_seconds, created_at FROM llm_cache"
    ):
        curD.execute(
            """
            INSERT INTO llm_cache (
              cache_key, model, strategy, prompt_hash, response_json,
              tokens_in, tokens_out, ttl_seconds, created_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (cache_key) DO NOTHING
            """,
            row,
        )


def copy_llm_cache_index(curS, curD):
    for row in curS.execute(
        "SELECT cache_key, entity_type, entity_id, created_at FROM llm_cache_index"
    ):
        curD.execute(
            """
            INSERT INTO llm_cache_index (cache_key, entity_type, entity_id, created_at)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
            """,
            row,
        )


def main() -> int:
    if not os.path.exists(SRC):
        print(f"No source SQLite file at {SRC}; nothing to migrate.")
        return 0
    with closing(sqlite3.connect(SRC)) as src, closing(psycopg.connect(DST)) as dst:
        src.row_factory = sqlite3.Row
        curS = src.cursor()
        curD = dst.cursor()
        print("Migrating resumes…")
        copy_resumes(curS, curD)
        print("Migrating jobs…")
        copy_jobs(curS, curD)
        print("Migrating processed_resumes…")
        copy_processed_resumes(curS, curD)
        print("Migrating processed_jobs…")
        copy_processed_jobs(curS, curD)
        print("Migrating llm_cache…")
        copy_llm_cache(curS, curD)
        print("Migrating llm_cache_index…")
        copy_llm_cache_index(curS, curD)
        dst.commit()
        print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
