<div align="center">

# ATS Copilot

### Screen, optimize, and tailor your resume for any job — directly from the job listing

![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Python](https://img.shields.io/badge/Python-3.13+-F0F0E8?style=for-the-badge&color=1d4ed8)
![Next.js](https://img.shields.io/badge/Next.js-16-F0F0E8?style=for-the-badge&color=1d4ed8)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-F0F0E8?style=for-the-badge&logo=googlechrome&color=1d4ed8)

</div>

---

## What Is ATS Copilot?

ATS Copilot is a self-hosted AI job application assistant. It adds a **one-click ATS screening workflow** directly into LinkedIn, Indeed, and Glassdoor — no copying, no tab-switching, no guessing whether your resume will pass the filter.

The Chrome extension reads the job listing you're viewing, sends it to your local AI, and gives you an instant compatibility score, keyword gap analysis, and an AI-rewritten resume tailored to that exact role.

---

## The Workflow

```
Browse job listing  →  Click extension  →  Get ATS score  →  Generate tailored resume  →  Download PDF
     (30 sec)              (1 click)          (instant)           (1 click)                (1 click)
```

### Step 1 — Browse any job listing

Open a job on LinkedIn, Indeed, or Glassdoor as you normally would. The extension detects the listing automatically.

### Step 2 — Click the ATS Copilot extension

Click the extension icon in your Chrome toolbar. It has already read the job title, company name, and full job description from the page — no copying required.

Select which of your stored resumes to screen against, then click **Run ATS Screen**.

### Step 3 — Review your ATS score

Within seconds you get:

| Result | What it tells you |
|--------|-------------------|
| **Match Score** | Overall compatibility percentage with a PASS / BORDERLINE / REJECT decision |
| **Keyword Table** | Every keyword from the JD — whether it was found in your resume and where |
| **Missing Keywords** | Gaps you should address before applying |
| **Warning Flags** | ATS red flags in your resume (tables, columns, non-standard formatting) |

### Step 4 — Generate an ATS-optimized tailored resume

Click **Create ATS Tailored Resume**. The AI rewrites your resume to close the keyword gaps and improve the match score for that specific role.

- Review the AI's optimization suggestions
- Edit the resume inline in the browser
- Save it as a new resume in your library

### Step 5 — Download and apply

Click **Download Resume** to export a clean, ATS-safe PDF. The file is named automatically after the role and company.

---

## Chrome Extension Setup

> **Requires:** ATS Copilot app running locally (backend + frontend). See [Installation](#installation) below.

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the `apps/extension/` folder from this repo
4. Pin the ATS Copilot extension to your toolbar
5. Click the extension icon → open **Settings** → confirm the backend URL (`http://localhost:8000`) and frontend URL (`http://localhost:3000`)

**Supported job boards:**

| Platform | What is extracted |
|----------|-------------------|
| LinkedIn | Job title, company, full job description |
| Indeed | Job title, company, full job description |
| Glassdoor | Job title, company, full job description |

---

## ATS Screen — In-App Workflow

You can also run ATS screening directly from the dashboard without the extension — useful for job descriptions you've copied from any source.

1. Go to the dashboard and click **ATS Screen**
2. Select a stored resume or paste resume text
3. Paste the job description
4. Click **Run ATS Screen**
5. Optionally click **Create ATS Tailored Resume** to generate and download an optimized version

---

## All Features

### Resume Builder

Upload your master resume and paste a job description to get an AI-tailored version.

- Modify AI-suggested content
- Add, remove, and reorder sections via drag-and-drop
- Choose from 4 professional templates

### ATS Screening

Score any resume against any job description before applying. Identifies keyword gaps, warning flags, and gives a hiring decision prediction.

### ATS Tailored Resume

One-click AI rewrite that closes keyword gaps between your resume and the job description. Edit inline, save to your library, download as PDF.

### Cover Letter Generator

Generate tailored cover letters based on the job description and your resume content.

### PDF Export

All resume templates export as clean, ATS-safe PDFs rendered by a headless browser — what you see in the editor is exactly what the recruiter receives.

### Resume Templates

| Template | Description |
|----------|-------------|
| **Classic Single Column** | Traditional full-width layout, maximum content density |
| **Modern Single Column** | Contemporary design with accent colors |
| **Classic Two Column** | Sidebar layout for skills-heavy roles |
| **Modern Two Column** | Sleek two-column with modern typography |

### Multi-Language Support

UI available in English, Spanish, Chinese (Simplified), Japanese, and Portuguese (Brazilian). Resume and cover letter content can be generated in any language.

---

## Installation

### Prerequisites

| Tool | Version | Link |
|------|---------|------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| uv | Latest | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Nikiyolo/ATS-Copilot.git
cd ATS-Copilot

# Backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Add your AI provider key
uv sync
uv run app

# Frontend (Terminal 2)
cd apps/frontend
npm install
npm run dev
```

Open **http://localhost:3000** and configure your AI provider in Settings.

Then load the Chrome extension from `apps/extension/` (see [Chrome Extension Setup](#chrome-extension-setup)).

### Supported AI Providers

| Provider | Type | Notes |
|----------|------|-------|
| **Ollama** | Local | Free, fully private, runs on your machine |
| **OpenAI** | Cloud | GPT-4o, GPT-4o Mini |
| **Anthropic** | Cloud | Claude Haiku, Claude Sonnet |
| **Google Gemini** | Cloud | Gemini Flash |
| **OpenRouter** | Cloud | Access to many models via one API key |
| **DeepSeek** | Cloud | DeepSeek Chat |

### Docker

```bash
docker run --name ats-copilot \
  -p 3000:3000 \
  -v ats-data:/app/backend/data \
  ghcr.io/srbhr/resume-matcher:latest
```

> Using Ollama with Docker? Set the Ollama URL to `http://host.docker.internal:11434` in Settings.

Endpoints:
- App: `http://localhost:3000`
- API docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.13+, LiteLLM |
| Frontend | Next.js 16, React 19, TypeScript |
| Chrome Extension | Manifest V3, Vanilla JS |
| Database | TinyDB (local JSON — no external DB required) |
| Styling | Tailwind CSS 4 |
| PDF Rendering | Headless Chromium via Playwright |

---

## Project Structure

```
ATS-Copilot/
├── apps/
│   ├── backend/          # FastAPI — ATS scoring, resume tailoring, PDF generation
│   ├── frontend/         # Next.js — dashboard, resume builder, ATS screen UI
│   └── extension/        # Chrome extension — content scripts + popup
│       ├── content/
│       │   ├── linkedin.js
│       │   ├── indeed.js
│       │   └── glassdoor.js
│       ├── popup/
│       └── background.js
└── README.md
```

---

## License

[Apache 2.0](LICENSE) — built on [Resume Matcher](https://github.com/srbhr/Resume-Matcher) by Saurabh Rai.
