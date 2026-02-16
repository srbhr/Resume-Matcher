# Enhanced JD Matcher: Dual-Score System

**Date:** 2026-02-16
**Status:** Approved

---

## Problem

The current JD matcher uses a single keyword-count algorithm: count how many JD keywords appear verbatim in the resume, divide by total keywords. This has three weaknesses:

1. **No synonym handling** — "React.js", "ReactJS", and "React" are treated as different keywords
2. **No semantic understanding** — "led engineering team" doesn't match "leadership experience"
3. **No weighting** — a required skill and a nice-to-have keyword count equally

## Decision

Implement **Approach A: Sentence-Transformers + Enhanced Keyword Matching** to produce two scores:

- **ATS Keyword Score** — what real ATS systems would see (enhanced keyword matching)
- **Semantic Relevance Score** — how truly relevant the resume is (embedding similarity)

## Architecture

### Score 1: ATS Keyword Score (Enhanced)

```
JD → LLM keyword extraction (existing)
     → Skill taxonomy normalization (new)
         "JS" = "JavaScript" = "Node.js"
         "React.js" = "ReactJS" = "React"
     → Fuzzy matching for abbreviations/variants (new)
     → Weighted scoring (new):
         required_skills match = 2x weight
         preferred_skills match = 1x weight
         generic keywords match = 0.5x weight
     → ATS Score (0-100)
```

**Taxonomy source:** Build a skill synonym dictionary from common tech skill variations. Start with ~200 skill clusters covering major technologies, frameworks, and certifications.

### Score 2: Semantic Relevance Score (New)

```
Resume sections → all-MiniLM-L6-v2 encoder → section embeddings
JD requirements → all-MiniLM-L6-v2 encoder → requirement embeddings
→ Section-wise cosine similarity
→ Weighted average:
    experience: 40%
    skills: 30%
    summary: 15%
    education: 10%
    projects: 5%
→ Semantic Score (0-100)
```

**Model:** `all-MiniLM-L6-v2` (80MB, 384-dim embeddings, Apache 2.0 license, CPU-viable ~200ms)

### API Design

New endpoint:

```
POST /resumes/{resume_id}/match-analysis
Request body: { "job_description_id": str }
Response: {
    "ats_score": {
        "score": float,           // 0-100
        "matched_keywords": [...],
        "missing_keywords": [...],
        "synonym_matches": [...]  // e.g., {"jd": "React.js", "resume": "ReactJS"}
    },
    "semantic_score": {
        "score": float,           // 0-100
        "section_scores": {
            "summary": float,
            "experience": float,
            "skills": float,
            "education": float,
            "projects": float
        }
    },
    "combined_score": float       // weighted blend for quick reference
}
```

### Frontend UI

In the JD Comparison View, replace the single match percentage bar with:

```
┌─────────────────────────────────────────┐
│  ATS Keyword Score         78%  ███████ │
│  Semantic Relevance Score  85%  ████████│
│                                         │
│  Matched: React, Python, AWS, Docker    │
│  Missing: Kubernetes, Terraform         │
│  Synonym matches: React.js → ReactJS   │
│                                         │
│  Weakest section: Summary (62%)         │
└─────────────────────────────────────────┘
```

## New Dependencies

- `sentence-transformers` (Python, Apache 2.0) — for embedding computation
- `all-MiniLM-L6-v2` model (~80MB, auto-downloaded on first use)

No GPU required. CPU inference ~200ms per encode call.

## Constraints

- Model loads once at startup and stays in memory (~300MB RAM)
- First request after cold start may be slower (model loading)
- Scoring is on-demand (user clicks "Analyze"), not real-time
- Existing keyword matching and refinement pipeline remain untouched
- This is additive — the new scores supplement, not replace, existing functionality

## Out of Scope

- Fine-tuning the sentence-transformer model on resume data
- spaCy NER or ESCO/O*NET taxonomy integration (Approach C territory)
- Real-time scoring as user types
- Cross-encoder (BERT) re-ranking
