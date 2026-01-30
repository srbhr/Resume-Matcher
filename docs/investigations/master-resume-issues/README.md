# Master Resume Creation Issues - Investigation Report

> **Investigation Date:** January 30, 2026
> **Status:** Documentation Complete - Awaiting Fixes
> **Total Issues Found:** 72

## Executive Summary

Users have reported intermittent failures when creating master resumes. A comprehensive investigation using 6 parallel exploration agents revealed **72 issues** across the codebase, with **12 critical** and **21 high severity** issues that could cause resume creation failures.

---

## Root Cause Analysis

The investigation identified three primary failure scenarios:

### Scenario A: LLM Parsing Fails Silently
1. User uploads PDF/DOCX resume
2. File converted to Markdown successfully
3. LLM called to extract structured JSON
4. **LLM returns malformed/truncated JSON** (token limit hit)
5. `_extract_json()` attempts repair, creates corrupted data
6. API returns HTTP 200 with hidden `processing_status: "failed"`
7. User sees "success" message but resume is unusable

### Scenario B: Concurrent Upload Race Condition
1. User uploads first resume (intended as master)
2. Network latency causes user to retry upload
3. Both requests check `is_master` simultaneously, both see `None`
4. Both create resumes marked as `is_master=True`
5. System enters inconsistent state with multiple masters

### Scenario C: Database Corruption Under Load
1. Multiple users/browser tabs making concurrent changes
2. TinyDB JSON file corrupted during simultaneous writes
3. Resume data lost or malformed
4. No recovery mechanism exists

---

## Issues by Component

| Component | File | Issues | Critical | High | Medium |
|-----------|------|--------|----------|------|--------|
| LLM Integration | [01-llm-integration.md](./01-llm-integration.md) | 14 | 3 | 5 | 6 |
| API Flow | [02-api-flow.md](./02-api-flow.md) | 13 | 2 | 4 | 7 |
| JSON Schema | [03-json-schema.md](./03-json-schema.md) | 12 | 1 | 3 | 8 |
| Service Layer | [04-service-layer.md](./04-service-layer.md) | 14 | 2 | 4 | 8 |
| Frontend | [05-frontend.md](./05-frontend.md) | 10 | 2 | 2 | 6 |
| Database | [06-database.md](./06-database.md) | 9 | 2 | 3 | 4 |
| **TOTAL** | | **72** | **12** | **21** | **39** |

---

## Critical Issues Summary

| # | Issue | Component | Location |
|---|-------|-----------|----------|
| 1 | Silent JSON parse failure on upload | API Flow | `routers/resumes.py:305-320` |
| 2 | LLM JSON truncation creates corrupted data | LLM | `llm.py:439-467` |
| 3 | Race condition: multiple masters can exist | API Flow | `routers/resumes.py:291-292` |
| 4 | No concurrency protection in TinyDB | Database | `database.py:14-48` |
| 5 | Shallow copy causes data mutation | Service | `routers/resumes.py:159` |
| 6 | Master alignment validation doesn't block | LLM | `refiner.py:202-294` |
| 7 | Fabricated companies not auto-removed | Service | `refiner.py:370-374` |
| 8 | Unsafe JSON loading without error handling | JSON | `routers/resumes.py:60` |
| 9 | No atomic transactions for multi-step ops | Database | `routers/resumes.py:646-668` |
| 10 | Silent cover letter save failures | Frontend | `resume-builder.tsx:454-465` |
| 11 | Save retry race condition | Frontend | `resume-builder.tsx:401-420` |
| 12 | `set_master_resume` has no atomicity | Database | `database.py:118-127` |

---

## Recommended Fix Priority

### P0 - Immediate (Blocks Users)
1. Fix silent upload failures - expose actual `processing_status` in response
2. Add deep copy in `_preserve_personal_info()`
3. Add database locking for master resume assignment
4. Increase LLM token buffer - reserve 500 tokens for JSON closing

### P1 - Short-term (Data Integrity)
5. Fix retry temperature logic - increase on retry, not decrease
6. Add JSON schema validation BEFORE storing `processed_data`
7. Add success notifications for cover letter/outreach saves
8. Auto-remove fabricated companies in alignment validation

### P2 - Medium-term (Robustness)
9. Implement idempotency keys for critical API operations
10. Add atomic transactions (migrate to SQLite or add manual locking)
11. Fix substring keyword matching - use word boundaries
12. Add frontend validation of API response data

---

## Investigation Methodology

Six specialized agents explored different areas of the codebase in parallel:

1. **Resume Creation API Flow Agent** - Traced the upload → parse → store flow
2. **JSON Schema & Parsing Agent** - Analyzed Pydantic models and JSON handling
3. **LLM Integration Agent** - Examined multi-provider AI integration edge cases
4. **Database Operations Agent** - Audited TinyDB usage and concurrency
5. **Frontend Form Submission Agent** - Investigated UI state management
6. **Service Layer Agent** - Audited business logic and data transformations

Each agent performed deep code analysis, identifying potential failure points, edge cases, and silent error conditions.

---

## Files in This Investigation

```
docs/investigations/master-resume-issues/
├── README.md                    # This file
├── 01-llm-integration.md        # LLM provider issues (14 issues)
├── 02-api-flow.md               # API endpoint issues (13 issues)
├── 03-json-schema.md            # Schema/parsing issues (12 issues)
├── 04-service-layer.md          # Business logic issues (14 issues)
├── 05-frontend.md               # UI/state issues (10 issues)
└── 06-database.md               # TinyDB issues (9 issues)
```

---

## Related Documentation

- [Backend Architecture Guide](../../agent/architecture/backend-guide.md)
- [Frontend Workflow](../../agent/architecture/frontend-workflow.md)
- [LLM Integration](../../agent/llm-integration.md)
- [API Contracts](../../agent/apis/front-end-apis.md)
