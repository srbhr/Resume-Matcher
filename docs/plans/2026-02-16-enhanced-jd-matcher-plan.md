# Enhanced JD Matcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dual-score JD matching — an enhanced ATS Keyword Score (with synonym normalization + weighting) and a Semantic Relevance Score (via sentence-transformers embeddings).

**Architecture:** New `matcher.py` backend service handles both scores. Skill synonym taxonomy lives in a standalone data file. Sentence-transformer model (`all-MiniLM-L6-v2`) loads lazily on first use. New API endpoint `POST /resumes/{id}/match-analysis` returns both scores. Frontend `jd-comparison-view.tsx` renders dual progress bars with detailed breakdowns.

**Tech Stack:** sentence-transformers (Python), all-MiniLM-L6-v2 (80MB model), FastAPI, React/TypeScript

---

## Task 1: Add sentence-transformers dependency

**Files:**
- Modify: `apps/backend/pyproject.toml:6-18`

**Step 1: Add the dependency**

Add `sentence-transformers` to the dependencies list in `pyproject.toml`:

```toml
dependencies = [
    "fastapi==0.128.4",
    "uvicorn==0.40.0",
    "python-multipart==0.0.22",
    "pydantic==2.12.5",
    "pydantic-settings==2.12.0",
    "tinydb==4.8.2",
    "litellm==1.81.8",
    "markitdown[docx]==0.1.4",
    "pdfminer.six==20260107",
    "playwright==1.58.0",
    "python-docx==1.2.0",
    "python-dotenv==1.2.1",
    "sentence-transformers>=3.0.0",
]
```

**Step 2: Install the dependency**

Run: `cd apps/backend && uv sync`
Expected: Resolves and installs sentence-transformers + torch (CPU) + huggingface-hub

**Step 3: Commit**

```bash
git add apps/backend/pyproject.toml
git commit -m "feat(deps): add sentence-transformers for semantic matching"
```

---

## Task 2: Create skill synonym taxonomy

**Files:**
- Create: `apps/backend/app/data/skill_taxonomy.py`

**Step 1: Create the taxonomy data file**

This file contains ~200 skill clusters mapping canonical names to their common variations. Used by the ATS keyword scorer for synonym normalization.

```python
"""Skill synonym taxonomy for ATS keyword normalization.

Each entry maps a canonical skill name to a set of known aliases.
Used to resolve "React.js" == "ReactJS" == "React" during keyword matching.
"""

# Each key is the canonical form; values are lowercase aliases
SKILL_SYNONYMS: dict[str, set[str]] = {
    # JavaScript ecosystem
    "javascript": {"javascript", "js", "ecmascript", "es6", "es2015"},
    "typescript": {"typescript", "ts"},
    "react": {"react", "react.js", "reactjs", "react js"},
    "next.js": {"next.js", "nextjs", "next js", "next"},
    "node.js": {"node.js", "nodejs", "node js", "node"},
    "vue.js": {"vue.js", "vuejs", "vue js", "vue"},
    "angular": {"angular", "angularjs", "angular.js", "angular js"},
    "express": {"express", "express.js", "expressjs"},
    "nuxt": {"nuxt", "nuxt.js", "nuxtjs"},
    "svelte": {"svelte", "sveltekit", "svelte kit"},
    "jquery": {"jquery", "j query"},
    "webpack": {"webpack", "web pack"},
    "vite": {"vite", "vitejs"},
    # Python ecosystem
    "python": {"python", "python3", "py", "python 3"},
    "django": {"django", "django framework"},
    "flask": {"flask", "flask framework"},
    "fastapi": {"fastapi", "fast api", "fast-api"},
    "pandas": {"pandas", "pd"},
    "numpy": {"numpy", "np"},
    "scikit-learn": {"scikit-learn", "sklearn", "scikit learn"},
    "pytorch": {"pytorch", "torch", "py torch"},
    "tensorflow": {"tensorflow", "tf", "tensor flow"},
    "celery": {"celery"},
    "sqlalchemy": {"sqlalchemy", "sql alchemy"},
    # Java/JVM
    "java": {"java", "java se", "java ee", "j2ee", "jdk"},
    "spring": {"spring", "spring boot", "springboot", "spring framework"},
    "kotlin": {"kotlin", "kt"},
    "scala": {"scala"},
    "gradle": {"gradle"},
    "maven": {"maven", "mvn"},
    # .NET / C#
    "c#": {"c#", "csharp", "c sharp", "c-sharp"},
    ".net": {".net", "dotnet", "dot net", ".net core", ".net framework"},
    "asp.net": {"asp.net", "aspnet", "asp.net core"},
    # Systems languages
    "c": {"c language", "c programming"},
    "c++": {"c++", "cpp", "c plus plus"},
    "rust": {"rust", "rust lang", "rustlang"},
    "go": {"go", "golang", "go lang"},
    # Mobile
    "react native": {"react native", "react-native", "reactnative", "rn"},
    "flutter": {"flutter", "dart flutter"},
    "swift": {"swift", "swiftui", "swift ui"},
    "ios": {"ios", "iphone os"},
    "android": {"android", "android sdk"},
    # Databases
    "postgresql": {"postgresql", "postgres", "pg", "psql"},
    "mysql": {"mysql", "my sql"},
    "mongodb": {"mongodb", "mongo", "mongo db"},
    "redis": {"redis"},
    "elasticsearch": {"elasticsearch", "elastic search", "es", "elastic"},
    "dynamodb": {"dynamodb", "dynamo db", "dynamo"},
    "sql server": {"sql server", "mssql", "ms sql", "microsoft sql server"},
    "sqlite": {"sqlite", "sq lite"},
    "cassandra": {"cassandra", "apache cassandra"},
    "neo4j": {"neo4j", "neo 4j"},
    "sql": {"sql", "structured query language"},
    "nosql": {"nosql", "no sql", "no-sql"},
    # Cloud platforms
    "aws": {"aws", "amazon web services", "amazon aws"},
    "azure": {"azure", "microsoft azure", "ms azure"},
    "gcp": {"gcp", "google cloud", "google cloud platform"},
    "heroku": {"heroku"},
    "vercel": {"vercel"},
    "netlify": {"netlify"},
    "digitalocean": {"digitalocean", "digital ocean"},
    # DevOps / Infrastructure
    "docker": {"docker", "docker container", "containerization"},
    "kubernetes": {"kubernetes", "k8s", "kube"},
    "terraform": {"terraform", "tf", "hcl"},
    "ansible": {"ansible"},
    "jenkins": {"jenkins", "jenkins ci"},
    "github actions": {"github actions", "gh actions", "gha"},
    "gitlab ci": {"gitlab ci", "gitlab-ci", "gitlab ci/cd"},
    "circleci": {"circleci", "circle ci"},
    "ci/cd": {"ci/cd", "cicd", "ci cd", "continuous integration", "continuous delivery"},
    "nginx": {"nginx", "engine x"},
    "apache": {"apache", "apache httpd", "httpd"},
    "linux": {"linux", "gnu/linux"},
    "bash": {"bash", "shell", "shell scripting", "sh"},
    "powershell": {"powershell", "ps", "power shell"},
    # Version control
    "git": {"git", "git scm"},
    "github": {"github", "git hub"},
    "gitlab": {"gitlab", "git lab"},
    "bitbucket": {"bitbucket", "bit bucket"},
    # Data / ML / AI
    "machine learning": {"machine learning", "ml", "machine-learning"},
    "deep learning": {"deep learning", "dl", "deep-learning"},
    "nlp": {"nlp", "natural language processing"},
    "computer vision": {"computer vision", "cv", "image recognition"},
    "data science": {"data science", "data-science"},
    "data engineering": {"data engineering", "data-engineering"},
    "etl": {"etl", "extract transform load"},
    "apache spark": {"apache spark", "spark", "pyspark"},
    "hadoop": {"hadoop", "apache hadoop"},
    "airflow": {"airflow", "apache airflow"},
    "kafka": {"kafka", "apache kafka"},
    "tableau": {"tableau"},
    "power bi": {"power bi", "powerbi", "power-bi"},
    # Testing
    "jest": {"jest"},
    "pytest": {"pytest", "py test", "py.test"},
    "cypress": {"cypress", "cypress.io"},
    "selenium": {"selenium", "selenium webdriver"},
    "playwright": {"playwright"},
    "unit testing": {"unit testing", "unit tests", "unit-testing"},
    "tdd": {"tdd", "test driven development", "test-driven development"},
    # API / Protocols
    "rest": {"rest", "restful", "rest api", "restful api"},
    "graphql": {"graphql", "graph ql", "gql"},
    "grpc": {"grpc", "g rpc"},
    "websocket": {"websocket", "websockets", "web socket", "ws"},
    "api": {"api", "apis", "web api"},
    # Design / Frontend
    "css": {"css", "css3", "cascading style sheets"},
    "html": {"html", "html5"},
    "sass": {"sass", "scss"},
    "tailwind": {"tailwind", "tailwind css", "tailwindcss"},
    "bootstrap": {"bootstrap"},
    "figma": {"figma"},
    "ui/ux": {"ui/ux", "ui ux", "ux/ui", "ux ui", "user experience", "user interface"},
    # Methodologies
    "agile": {"agile", "agile methodology", "agile development"},
    "scrum": {"scrum", "scrum master"},
    "kanban": {"kanban"},
    "jira": {"jira", "atlassian jira"},
    # Security
    "oauth": {"oauth", "oauth2", "oauth 2.0"},
    "jwt": {"jwt", "json web token", "json web tokens"},
    "ssl/tls": {"ssl/tls", "ssl", "tls", "https"},
    # Misc
    "microservices": {"microservices", "micro services", "micro-services"},
    "monorepo": {"monorepo", "mono repo", "mono-repo"},
    "serverless": {"serverless", "server-less", "faas"},
    "rabbitmq": {"rabbitmq", "rabbit mq", "rabbit"},
    "graphdb": {"graphdb", "graph database"},
    "aws lambda": {"aws lambda", "lambda"},
    "s3": {"s3", "amazon s3", "aws s3"},
    "ec2": {"ec2", "amazon ec2", "aws ec2"},
    "ecs": {"ecs", "amazon ecs", "aws ecs"},
    "sqs": {"sqs", "amazon sqs", "aws sqs"},
    "sns": {"sns", "amazon sns", "aws sns"},
    "cloudformation": {"cloudformation", "cloud formation", "cfn"},
    "cdk": {"cdk", "aws cdk", "cloud development kit"},
}


def build_reverse_lookup() -> dict[str, str]:
    """Build alias-to-canonical lookup table.

    Returns a dict mapping every lowercase alias to its canonical skill name.
    Example: {"reactjs": "react", "react.js": "react", "react": "react"}
    """
    lookup: dict[str, str] = {}
    for canonical, aliases in SKILL_SYNONYMS.items():
        for alias in aliases:
            lookup[alias.lower()] = canonical
    return lookup


# Pre-built reverse lookup for fast access
ALIAS_TO_CANONICAL: dict[str, str] = build_reverse_lookup()
```

**Step 2: Verify the module loads**

Run: `cd apps/backend && python -c "from app.data.skill_taxonomy import ALIAS_TO_CANONICAL; print(f'{len(ALIAS_TO_CANONICAL)} aliases loaded')"`
Expected: Something like `350+ aliases loaded`

**Step 3: Commit**

```bash
git add apps/backend/app/data/skill_taxonomy.py
git commit -m "feat: add skill synonym taxonomy for ATS keyword normalization"
```

---

## Task 3: Create the match analysis schemas

**Files:**
- Create: `apps/backend/app/schemas/match_analysis.py`

**Step 1: Create the Pydantic models**

```python
"""Pydantic models for dual-score match analysis."""

from pydantic import BaseModel, Field


class SynonymMatch(BaseModel):
    """A keyword match that was resolved through synonym normalization."""

    jd_term: str = Field(description="The term as it appears in the job description")
    resume_term: str = Field(description="The matching term found in the resume")
    canonical: str = Field(description="The canonical skill name both resolve to")


class ATSScoreResult(BaseModel):
    """Enhanced ATS keyword matching score with synonym support."""

    score: float = Field(ge=0.0, le=100.0, description="Weighted ATS keyword score")
    matched_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    synonym_matches: list[SynonymMatch] = Field(default_factory=list)
    total_keywords: int = Field(default=0, ge=0)


class SectionScore(BaseModel):
    """Semantic similarity score for a single resume section."""

    section: str = Field(description="Section name: summary, experience, skills, education, projects")
    score: float = Field(ge=0.0, le=100.0)


class SemanticScoreResult(BaseModel):
    """Semantic relevance score from sentence-transformer embeddings."""

    score: float = Field(ge=0.0, le=100.0, description="Weighted semantic relevance score")
    section_scores: list[SectionScore] = Field(default_factory=list)


class MatchAnalysisResponse(BaseModel):
    """Complete dual-score match analysis response."""

    ats_score: ATSScoreResult
    semantic_score: SemanticScoreResult
    combined_score: float = Field(
        ge=0.0, le=100.0,
        description="Blended score: 0.5 * ats + 0.5 * semantic",
    )
```

**Step 2: Verify schema loads**

Run: `cd apps/backend && python -c "from app.schemas.match_analysis import MatchAnalysisResponse; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add apps/backend/app/schemas/match_analysis.py
git commit -m "feat: add Pydantic schemas for dual-score match analysis"
```

---

## Task 4: Create the matcher service (backend core logic)

**Files:**
- Create: `apps/backend/app/services/matcher.py`

This is the core service. It has two scoring functions and a top-level `analyze_match()` orchestrator.

**Step 1: Create the service**

```python
"""Dual-score match analysis service.

Provides two complementary scores:
1. ATS Keyword Score - enhanced keyword matching with synonym normalization and weighting
2. Semantic Relevance Score - sentence-transformer embedding similarity
"""

import logging
import re
from typing import Any

from app.data.skill_taxonomy import ALIAS_TO_CANONICAL
from app.schemas.match_analysis import (
    ATSScoreResult,
    MatchAnalysisResponse,
    SectionScore,
    SemanticScoreResult,
    SynonymMatch,
)

logger = logging.getLogger(__name__)

# Lazy-loaded model reference
_model = None


def _get_model():
    """Lazy-load the sentence-transformer model on first use."""
    global _model
    if _model is None:
        logger.info("Loading sentence-transformer model (first use)...")
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Model loaded successfully")
    return _model


def _normalize_skill(term: str) -> str:
    """Normalize a skill term to its canonical form using the taxonomy.

    Returns the canonical name if found, otherwise returns the lowered term.
    """
    lowered = term.lower().strip()
    return ALIAS_TO_CANONICAL.get(lowered, lowered)


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check if keyword exists as a whole word in text."""
    escaped = re.escape(keyword.lower())
    pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text.lower()))


def _extract_section_text(data: dict[str, Any], section: str) -> str:
    """Extract text from a specific resume section."""
    parts: list[str] = []

    if section == "summary":
        if data.get("summary"):
            parts.append(str(data["summary"]))

    elif section == "experience":
        for exp in data.get("workExperience", []):
            if isinstance(exp, dict):
                parts.append(str(exp.get("title", "")))
                parts.append(str(exp.get("company", "")))
                desc = exp.get("description", [])
                if isinstance(desc, list):
                    parts.extend(str(d) for d in desc)

    elif section == "skills":
        additional = data.get("additional", {})
        if isinstance(additional, dict):
            for field in ["technicalSkills", "certificationsTraining", "languages"]:
                items = additional.get(field, [])
                if isinstance(items, list):
                    parts.extend(str(s) for s in items)

    elif section == "education":
        for edu in data.get("education", []):
            if isinstance(edu, dict):
                parts.append(str(edu.get("degree", "")))
                parts.append(str(edu.get("institution", "")))
                if edu.get("description"):
                    parts.append(str(edu["description"]))

    elif section == "projects":
        for proj in data.get("personalProjects", []):
            if isinstance(proj, dict):
                parts.append(str(proj.get("name", "")))
                parts.append(str(proj.get("role", "")))
                desc = proj.get("description", [])
                if isinstance(desc, list):
                    parts.extend(str(d) for d in desc)

    return " ".join(p for p in parts if p)


def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text from all resume sections."""
    sections = ["summary", "experience", "skills", "education", "projects"]
    return " ".join(_extract_section_text(data, s) for s in sections)


def calculate_ats_score(
    resume_data: dict[str, Any],
    jd_keywords: dict[str, Any],
) -> ATSScoreResult:
    """Calculate enhanced ATS keyword score with synonym normalization and weighting.

    Weights:
    - required_skills: 2.0 per match
    - preferred_skills: 1.0 per match
    - generic keywords: 0.5 per match
    """
    resume_text = _extract_all_text(resume_data).lower()

    # Build normalized resume skill set (canonical forms of all words)
    # We check each resume word against the taxonomy
    resume_words = set(re.findall(r"[a-z0-9#+./-]+", resume_text))
    resume_canonical: set[str] = set()
    resume_term_to_canonical: dict[str, str] = {}
    for word in resume_words:
        canon = _normalize_skill(word)
        resume_canonical.add(canon)
        resume_term_to_canonical[word] = canon

    # Also check multi-word phrases from the resume against taxonomy
    for alias, canon in ALIAS_TO_CANONICAL.items():
        if " " in alias or "." in alias or "/" in alias:
            if _keyword_in_text(alias, resume_text):
                resume_canonical.add(canon)
                resume_term_to_canonical[alias] = canon

    # Score each JD keyword category with weights
    categories = [
        ("required_skills", 2.0),
        ("preferred_skills", 1.0),
        ("keywords", 0.5),
    ]

    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    synonym_matches: list[SynonymMatch] = []
    total_weight = 0.0
    matched_weight = 0.0

    seen_canonical: set[str] = set()

    for category, weight in categories:
        keywords = jd_keywords.get(category, [])
        if not isinstance(keywords, list):
            continue

        for kw in keywords:
            if not isinstance(kw, str) or not kw.strip():
                continue

            kw_clean = kw.strip()
            kw_canonical = _normalize_skill(kw_clean)

            # Skip duplicates across categories
            if kw_canonical in seen_canonical:
                continue
            seen_canonical.add(kw_canonical)

            total_weight += weight

            # Check 1: Direct match (word boundary)
            if _keyword_in_text(kw_clean, resume_text):
                matched_keywords.append(kw_clean)
                matched_weight += weight
                continue

            # Check 2: Synonym match (canonical form found in resume)
            if kw_canonical in resume_canonical:
                matched_keywords.append(kw_clean)
                matched_weight += weight
                # Find what resume term resolved to same canonical
                resume_term = next(
                    (t for t, c in resume_term_to_canonical.items() if c == kw_canonical),
                    kw_canonical,
                )
                synonym_matches.append(
                    SynonymMatch(
                        jd_term=kw_clean,
                        resume_term=resume_term,
                        canonical=kw_canonical,
                    )
                )
                continue

            missing_keywords.append(kw_clean)

    score = (matched_weight / total_weight * 100) if total_weight > 0 else 0.0

    return ATSScoreResult(
        score=round(score, 1),
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        synonym_matches=synonym_matches,
        total_keywords=len(seen_canonical),
    )


def calculate_semantic_score(
    resume_data: dict[str, Any],
    job_description: str,
) -> SemanticScoreResult:
    """Calculate semantic relevance score using sentence-transformer embeddings.

    Encodes each resume section and the full JD, then computes cosine similarity.
    Returns a weighted average based on section importance.
    """
    model = _get_model()

    section_weights = {
        "experience": 0.40,
        "skills": 0.30,
        "summary": 0.15,
        "education": 0.10,
        "projects": 0.05,
    }

    section_scores: list[SectionScore] = []
    weighted_total = 0.0

    # Encode JD once
    jd_embedding = model.encode(job_description, convert_to_tensor=True)

    for section_name, weight in section_weights.items():
        text = _extract_section_text(resume_data, section_name)

        if not text.strip():
            section_scores.append(SectionScore(section=section_name, score=0.0))
            continue

        # Encode section
        section_embedding = model.encode(text, convert_to_tensor=True)

        # Cosine similarity (sentence-transformers returns tensors)
        from sentence_transformers import util

        similarity = util.cos_sim(section_embedding, jd_embedding).item()

        # Convert from [-1, 1] to [0, 100]
        score = max(0.0, min(100.0, (similarity + 1) * 50))

        section_scores.append(SectionScore(section=section_name, score=round(score, 1)))
        weighted_total += score * weight

    return SemanticScoreResult(
        score=round(weighted_total, 1),
        section_scores=section_scores,
    )


def analyze_match(
    resume_data: dict[str, Any],
    job_description: str,
    jd_keywords: dict[str, Any],
) -> MatchAnalysisResponse:
    """Run full dual-score match analysis.

    Args:
        resume_data: Structured resume data dict
        job_description: Raw job description text
        jd_keywords: LLM-extracted structured keywords

    Returns:
        MatchAnalysisResponse with ATS score, semantic score, and combined score
    """
    ats = calculate_ats_score(resume_data, jd_keywords)
    semantic = calculate_semantic_score(resume_data, job_description)

    combined = round(0.5 * ats.score + 0.5 * semantic.score, 1)

    return MatchAnalysisResponse(
        ats_score=ats,
        semantic_score=semantic,
        combined_score=combined,
    )
```

**Step 2: Verify the service imports**

Run: `cd apps/backend && python -c "from app.services.matcher import calculate_ats_score; print('OK')"`
Expected: `OK` (semantic functions will lazy-load the model, so we only verify import here)

**Step 3: Commit**

```bash
git add apps/backend/app/services/matcher.py
git commit -m "feat: add dual-score matcher service with ATS + semantic scoring"
```

---

## Task 5: Add the match-analysis API endpoint

**Files:**
- Modify: `apps/backend/app/routers/resumes.py`

**Step 1: Add the endpoint**

Add this endpoint after the existing `get_job_description_for_resume` endpoint (after line ~1419 in `resumes.py`):

```python
from app.services.matcher import analyze_match
from app.schemas.match_analysis import MatchAnalysisResponse


@router.post("/{resume_id}/match-analysis", response_model=MatchAnalysisResponse)
async def match_analysis_endpoint(resume_id: str) -> MatchAnalysisResponse:
    """Run dual-score match analysis on a tailored resume against its job description.

    Returns:
    - ATS Keyword Score: enhanced keyword matching with synonym normalization
    - Semantic Relevance Score: sentence-transformer embedding similarity
    - Combined Score: weighted blend of both
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Match analysis is only available for tailored resumes.",
        )

    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data.",
        )

    # Get the job description
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume.",
        )

    job = db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    jd_keywords = job.get("job_keywords")
    if not jd_keywords:
        raise HTTPException(
            status_code=400,
            detail="Job keywords not available. Please re-tailor the resume.",
        )

    try:
        result = analyze_match(resume_data, job["content"], jd_keywords)
        return result
    except Exception as e:
        logger.error("Match analysis failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Match analysis failed. Please try again.",
        )
```

**Step 2: Verify the endpoint registers**

Run: `cd apps/backend && python -c "from app.routers.resumes import router; print([r.path for r in router.routes if 'match' in r.path])"`
Expected: `['/{resume_id}/match-analysis']`

**Step 3: Commit**

```bash
git add apps/backend/app/routers/resumes.py
git commit -m "feat: add POST /resumes/{id}/match-analysis endpoint"
```

---

## Task 6: Add frontend API client function

**Files:**
- Modify: `apps/frontend/lib/api/resume.ts`

**Step 1: Add the types and function**

Add at the end of `apps/frontend/lib/api/resume.ts`:

```typescript
/** Synonym match detail from ATS scoring */
export interface SynonymMatch {
  jd_term: string;
  resume_term: string;
  canonical: string;
}

/** ATS keyword score result */
export interface ATSScoreResult {
  score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  synonym_matches: SynonymMatch[];
  total_keywords: number;
}

/** Section-level semantic score */
export interface SectionScore {
  section: string;
  score: number;
}

/** Semantic relevance score result */
export interface SemanticScoreResult {
  score: number;
  section_scores: SectionScore[];
}

/** Complete match analysis response */
export interface MatchAnalysisResponse {
  ats_score: ATSScoreResult;
  semantic_score: SemanticScoreResult;
  combined_score: number;
}

/** Fetches dual-score match analysis for a tailored resume */
export async function fetchMatchAnalysis(resumeId: string): Promise<MatchAnalysisResponse> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/match-analysis`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Match analysis failed (status ${res.status}): ${text}`);
  }
  return res.json();
}
```

**Step 2: Commit**

```bash
git add apps/frontend/lib/api/resume.ts
git commit -m "feat: add fetchMatchAnalysis API client function"
```

---

## Task 7: Update JD comparison view with dual scores

**Files:**
- Modify: `apps/frontend/components/builder/jd-comparison-view.tsx`

**Step 1: Update the component**

Replace the current stats bar section in `jd-comparison-view.tsx` with a dual-score display. The component should:

1. Keep the existing keyword matching as the instant/fallback display
2. Add a "Run Deep Analysis" button that calls `fetchMatchAnalysis`
3. When analysis results arrive, show both ATS score and Semantic score bars
4. Show matched/missing keywords, synonym matches, and weakest section

The updated component adds:
- A `useState` for `MatchAnalysisResponse | null`
- A `useState` for loading state
- An `analyzeMatch` async handler that calls `fetchMatchAnalysis(resumeId)`
- A new stats section that shows dual scores when available, fallback to existing when not

Key UI structure (Swiss International Style — `rounded-none`, `font-mono`, `border-black`):

```tsx
{/* When analysis is available */}
{analysis && (
  <div className="px-4 py-3 bg-white border-b border-black space-y-2">
    {/* ATS Score Bar */}
    <div className="flex items-center justify-between">
      <span className="text-xs font-mono uppercase tracking-wide">ATS Keyword Score</span>
      <span className="text-lg font-bold font-mono">{analysis.ats_score.score}%</span>
    </div>
    <div className="h-2 bg-gray-200 rounded-none">
      <div className="h-2 bg-black rounded-none" style={{ width: `${analysis.ats_score.score}%` }} />
    </div>

    {/* Semantic Score Bar */}
    <div className="flex items-center justify-between">
      <span className="text-xs font-mono uppercase tracking-wide">Semantic Relevance</span>
      <span className="text-lg font-bold font-mono">{analysis.semantic_score.score}%</span>
    </div>
    <div className="h-2 bg-gray-200 rounded-none">
      <div className="h-2 bg-[#1D4ED8] rounded-none" style={{ width: `${analysis.semantic_score.score}%` }} />
    </div>

    {/* Detail rows */}
    <div className="text-xs font-mono space-y-1 pt-1">
      {analysis.ats_score.synonym_matches.length > 0 && (
        <p className="text-gray-600">
          Synonyms resolved: {analysis.ats_score.synonym_matches.map(s => `${s.jd_term} → ${s.resume_term}`).join(', ')}
        </p>
      )}
      {analysis.ats_score.missing_keywords.length > 0 && (
        <p className="text-red-600">
          Missing: {analysis.ats_score.missing_keywords.join(', ')}
        </p>
      )}
      {analysis.semantic_score.section_scores.length > 0 && (
        <p className="text-gray-600">
          Weakest: {analysis.semantic_score.section_scores.reduce((min, s) => s.score < min.score ? s : min).section}
          {' '}({analysis.semantic_score.section_scores.reduce((min, s) => s.score < min.score ? s : min).score}%)
        </p>
      )}
    </div>
  </div>
)}
```

The component needs `resumeId` as a new prop to call the API. Add it to `JDComparisonViewProps`:

```typescript
interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
  jobKeywords?: JobKeywords;
  resumeId?: string; // Needed for match analysis API call
}
```

**Step 2: Commit**

```bash
git add apps/frontend/components/builder/jd-comparison-view.tsx
git commit -m "feat: add dual-score display to JD comparison view"
```

---

## Task 8: Pass resumeId to JDComparisonView

**Files:**
- Modify: `apps/frontend/app/(default)/resumes/[id]/page.tsx` (wherever `JDComparisonView` is rendered)

**Step 1: Find and update the parent component**

Wherever `<JDComparisonView>` is rendered, add the `resumeId` prop:

```tsx
<JDComparisonView
  jobDescription={jobDescription}
  resumeData={resumeData}
  jobKeywords={jobKeywords}
  resumeId={resumeId}  // Add this
/>
```

**Step 2: Commit**

```bash
git add apps/frontend/app/
git commit -m "feat: pass resumeId to JDComparisonView for match analysis"
```

---

## Task 9: Add i18n strings for dual scores

**Files:**
- Modify: `apps/frontend/messages/en.json`
- Modify: `apps/frontend/messages/es.json`
- Modify: `apps/frontend/messages/ja.json`
- Modify: `apps/frontend/messages/pt-BR.json`
- Modify: `apps/frontend/messages/zh.json`

**Step 1: Add English strings**

Add under `builder.jdMatch`:

```json
{
  "builder": {
    "jdMatch": {
      "analyzeButton": "Run Deep Analysis",
      "analyzing": "Analyzing...",
      "atsScore": "ATS Keyword Score",
      "semanticScore": "Semantic Relevance",
      "synonymsResolved": "Synonyms resolved",
      "missingKeywords": "Missing",
      "weakestSection": "Weakest section"
    }
  }
}
```

**Step 2: Add equivalent strings for es, ja, pt-BR, zh**

Use appropriate translations for each locale.

**Step 3: Commit**

```bash
git add apps/frontend/messages/
git commit -m "feat: add i18n strings for dual-score match analysis"
```

---

## Task 10: Ensure __init__.py exists for data package

**Files:**
- Create: `apps/backend/app/data/__init__.py` (if it doesn't exist)

**Step 1: Create the init file**

```python
```

(Empty file — just makes it a Python package.)

**Step 2: Commit**

```bash
git add apps/backend/app/data/__init__.py
git commit -m "chore: add __init__.py for data package"
```

---

## Task 11: Run lint and format

**Step 1: Run frontend lint**

Run: `npm run lint`
Expected: No errors (fix any that appear)

**Step 2: Run Prettier**

Run: `npm run format`
Expected: Files formatted

**Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "style: lint and format"
```

---

## Task 12: Manual integration test

**Step 1: Start the dev servers**

Run: `npm run dev`

**Step 2: Test the flow**

1. Open the app at http://localhost:3000
2. Upload a resume and tailor it to a job description
3. Open the tailored resume's JD comparison view
4. Click "Run Deep Analysis"
5. Verify:
   - Both score bars appear
   - ATS score shows matched/missing keywords
   - Synonym matches appear if relevant (e.g., "React.js" → "ReactJS")
   - Semantic score shows section breakdown
   - Weakest section is identified
   - Loading state works correctly

**Step 3: Test edge cases**

- Resume with no skills section (semantic score should handle gracefully)
- JD with no keywords extracted (should show error or empty state)
- Network error during analysis (should show error message)

---

## Summary of all new/modified files

| Action | File |
|--------|------|
| Modify | `apps/backend/pyproject.toml` |
| Create | `apps/backend/app/data/__init__.py` |
| Create | `apps/backend/app/data/skill_taxonomy.py` |
| Create | `apps/backend/app/schemas/match_analysis.py` |
| Create | `apps/backend/app/services/matcher.py` |
| Modify | `apps/backend/app/routers/resumes.py` |
| Modify | `apps/frontend/lib/api/resume.ts` |
| Modify | `apps/frontend/components/builder/jd-comparison-view.tsx` |
| Modify | `apps/frontend/app/(default)/resumes/[id]/page.tsx` |
| Modify | `apps/frontend/messages/en.json` |
| Modify | `apps/frontend/messages/es.json` |
| Modify | `apps/frontend/messages/ja.json` |
| Modify | `apps/frontend/messages/pt-BR.json` |
| Modify | `apps/frontend/messages/zh.json` |
