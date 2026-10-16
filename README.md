<div align="center">

[![Resume Matcher](assets/header.webp)](https://www.resumematcher.fyi)

# Resume Matcher

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](https://resumematcher.fyi/docs/installation) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝚂𝚙𝚘𝚗𝚜𝚘𝚛](#sponsors) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/srbhr_r) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/) ✦ [𝙲𝚛𝚎𝚊𝚝𝚘𝚛](https://srbhr.com)

**English** | [Español](README.es.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

Open-source resume builder that tailors your resume (CV) to each job description. A self-hosted AI harness for Claude, ChatGPT, DeepSeek, Kimi, GLM, Gemma and other LLMs, local or remote.

![Resume Matcher Demo](assets/Resume_Matcher_Demo_2.gif)

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![version](https://img.shields.io/badge/Version-1.3%20Crescendolls%20-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)

[![Discord](https://img.shields.io/discord/1122069176962531400?labelColor=F0F0E8&logo=discord&logoColor=1d4ed8&style=for-the-badge&color=1d4ed8)](https://dsc.gg/resume-matcher) [![Website](https://img.shields.io/badge/website-Resume%20Matcher-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)](https://resumematcher.fyi) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Resume%20Matcher-FFF?labelColor=F0F0E8&logo=LinkedIn&style=for-the-badge&color=1d4ed8)](https://www.linkedin.com/company/resume-matcher/)

<a href="https://trendshift.io/repositories/565" target="_blank"><img src="https://trendshift.io/api/badge/repositories/565" alt="srbhr%2FResume-Matcher | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)

</div>

> \[!IMPORTANT]
>
> The project needs your help and support. If you can donate a small amount, that will help me to continue developing and improving Resume Matcher.

<div align="center">

[![Sponsor on GitHub](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&label=Sponsor&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr)

**Sponsoring for a company?** Put your logo in front of 27k+ developers → **[become a sponsor ↓](#sponsors)**

</div>

## Getting Started

Resume Matcher works by creating a master resume that you can use to tailor for each job application. Installation instructions here: [How to Install](#how-to-install)

### How It Works

1. **Upload** your master resume (PDF or DOCX)
2. **Paste** a job description you're targeting
3. **Review** AI-generated improvements and tailored content
4. **Cover Letter** and optional interview preparation for the job application
5. **Customize** the layout and sections to fit your style
6. **Export** as a professional PDF with your preferred template

### Built for Software Engineers

Installing Resume Matcher takes a terminal, so most of the people running it write software. It fits the way you already work:

- **It runs on your machine.** A FastAPI backend, a Next.js frontend and a SQLite file. Clone the repo or start one Docker container. You don't create an account, and your resume stays in your own database.
- **You choose the model.** Bring an API key for OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter or Groq, or run a local model with Ollama so your resume never leaves the machine.
- **Claude Code can drive it.** The [MCP server](SETUP.md#use-resume-matcher-from-claude-code-or-claude-desktop-mcp) lets Claude Code, Cursor or Codex write the tailored resume while Resume Matcher stores, checks and renders it, with no LLM key.
- **It sticks to your real experience.** The tailoring prompts forbid adding skills, tools, employers or metrics that aren't in your master resume.
- **The scores are plain code.** The ATS score ([`services/ats.py`](apps/backend/app/services/ats.py)) and the ATS check ([`services/ats_parse/`](apps/backend/app/services/ats_parse/)) make no LLM call. The ATS check runs your PDF through pdfminer to show what an applicant tracking system would extract.
- **The templates look like engineering resumes.** Deedy, Modern Deedy and a LaTeX-style layout sit next to single- and two-column options. Seven of the designs also come as editable pdfLaTeX projects for Overleaf in [resume-matcher-templates](https://github.com/resume-matcher/resume-matcher-templates).

### Stay Connected

[![Discord](assets/resume_matcher_discord.webp)](https://dsc.gg/resume-matcher)

Join our [Discord](https://dsc.gg/resume-matcher) for discussions, feature requests, and community support.

[![LinkedIn](assets/resume_matcher_linkedin.webp)](https://www.linkedin.com/company/resume-matcher/)

Follow us on [LinkedIn](https://www.linkedin.com/company/resume-matcher/) for updates.

![Star Resume Matcher](assets/star_resume_matcher.webp)

Star the repo to support development and get notified of new releases.

## Sponsors

![sponsors](assets/sponsors.webp)

Resume Matcher is free and open-source, kept alive by its sponsors and backers. If it helps you, please consider supporting its development.

### Companies backing Resume Matcher

Sponsor at a company tier and **your logo + link + blurb lands here** — in front of a community of **27k+ stars and 4.9k forks**, featured on [Trendshift](https://trendshift.io/repositories/565) and the [Vercel OSS Program](https://vercel.com/oss).

| Sponsor | Description |
|---------|-------------|
| [Apideck](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | One API to connect your app to 200+ SaaS platforms (accounting, HRIS, CRM, file storage). Build integrations once, not 50 times. 🌐 [apideck.com](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Vercel](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Resume Matcher is a part of Vercel OSS // Summer 2025 Program 🌐 [vercel.com](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Cubic provides PR reviews for Resume Matcher 🌐 [cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Kilo Code](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Kilo Code provides AI code reviews and coding credits to Resume Matcher 🌐 [kilo.ai](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [ZanReal](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | ZanReal is an AI-driven development company building scalable cloud solutions, from strategy and UX to DevOps, helping teams ship faster and turn ideas into production. 🌐 [zanreal.com](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| **✦ Your company here** | Reach 27k+ developers and 4.9k forks. **[Become a sponsor →](https://github.com/sponsors/srbhr)** |

Read the [Sponsorship Guide](https://resumematcher.fyi/docs/sponsoring) for tiers and details. Sponsors get a special thank-you in the README and on our website.

<a id="support-the-development-by-donating"></a>

### Support as an individual

![donate](assets/supporting_resume_matcher.webp)

Every bit keeps Resume Matcher free and funds new features — and you'll be thanked in the README and on our website.

| Platform  | Link                                   |
|-----------|----------------------------------------|
| GitHub    | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

## Creators' Note

[![srbhr](assets/creators_note.webp)](https://srbhr.com)

Thank you for checking out Resume Matcher. If you want to connect, collaborate, or just say hi, feel free to reach out!
~ **Saurabh Rai** ✨

You can follow me on:

- Website: [https://srbhr.com](https://srbhr.com)
- Linkedin: [https://www.linkedin.com/in/srbhr/](https://www.linkedin.com/in/srbhr/)
- Twitter: [https://twitter.com/srbhr_r](https://twitter.com/srbhr_r)
- GitHub: [https://github.com/srbhr](https://github.com/srbhr)

## Key Features

![resume_matcher_features](assets/features.webp)

### Core Features

**Master Resume**: Create a comprehensive master resume to draw from your existing one.

![Dashboard with a master resume and seven tailored resumes](assets/step_2.webp)

### Resume Builder

![Resume Builder with the template picker and a live preview of a software engineer resume](assets/step_5.webp)

Paste in a job description and get AI-powered resume tailored for that specific role.

You can:

- Modify suggested content
- Add/remove sections
- Rearrange sections via drag-and-drop
- Choose from multiple resume templates

### Cover Letter Generator

Generate tailored cover letters based on the job description and your resume.

![Cover letter editor next to its PDF preview](assets/cover_letter.webp)

### Interview Preparation

Generate structured, resume-grounded interview prep for saved tailored resumes. Use the Builder's Interview Prep tab on demand, or enable automatic generation in Settings.

### Tailoring Queue

Paste several job descriptions on the Tailoring Queue page and they are tailored from your master resume one after another in the background. Role, company and job ID are detected from the text without an AI call, and you can edit them. An optional cooldown between jobs (0 to 60 seconds) lowers the risk of hitting your provider's rate limits. Queued jobs are kept in the database and resume after a restart.

### Resume Scoring & Keyword Highlighting

Analyze your resume against the job description with a match score, keyword highlighting, and suggestions for improvement.

![JD Match tab with the ATS score breakdown and matching keywords highlighted](assets/keyword_highlighter.webp)

### PDF Export

Export your tailored resume and cover letter in PDF.

### Templates

The templates export text-based PDFs in A4 or US Letter that applicant tracking systems can parse.

| Template Name | Preview | Description |
|---------------|---------|-------------|
| **Single Column** | ![Single Column](assets/pdf-templates/single-column.webp) | Traditional full-width layout with maximum content density. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/single-column.pdf) |
| **Two Column** | ![Two Column](assets/pdf-templates/two-column.webp) | Experience-focused main column with sidebar for skills. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/two-column.pdf) |
| **Modern** | ![Modern](assets/pdf-templates/modern-single-column.webp) | Colorful accents with customizable theme colors. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-single-column.pdf) |
| **Modern Two Column** | ![Modern Two Column](assets/pdf-templates/modern-two-column.webp) | Two-column layout with modern colorful accents and themes. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-two-column.pdf) |
| **LaTeX** | ![LaTeX](assets/pdf-templates/latex.webp) | Classic serif academic layout with ruled section headers. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/latex.pdf) |
| **Clean** | ![Clean](assets/pdf-templates/clean.webp) | Minimal sans layout with large understated section headers. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/clean.pdf) |
| **Vivid** | ![Vivid](assets/pdf-templates/vivid.webp) | Colorful two-column layout with accent headers and arrow bullets. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/vivid.pdf) |
| **Vivid Single Column** | ![Vivid Single Column](assets/pdf-templates/vivid-single.webp) | Colorful single-column layout with accent headers and arrow bullets. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/vivid-single.pdf) |
| **Modern Deedy** | ![Modern Deedy](assets/pdf-templates/modern-deedy.webp) | Dense one-page layout in Lato with light grey uppercase section headings. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-deedy.pdf) |
| **Deedy** | ![Deedy](assets/pdf-templates/deedy.webp) | Two-column layout with a hairline name, a narrow left column and light gray headings. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/deedy.pdf) |

### Internationalization

- **Multi-Language UI**: Interface available in English, Spanish, Chinese, Japanese, and Portuguese (Brazilian)
- **Multi-Language Content**: Generate resumes and cover letters in your preferred language

### Roadmap

If you have any suggestions or feature requests, please feel free to open an issue on GitHub or discuss it on our [Discord](https://dsc.gg/resume-matcher) server.

- AI Canvas for crafting impactful, metric-driven resume content
- Email template generator for job applications
- Multi-job description optimization

## Resume Guides for Software Engineers

The [Resume Matcher blog](https://resumematcher.fyi/blog/) has writing guides for developers, from a first internship resume to a FAANG application:

- [Software engineer resume](https://resumematcher.fyi/blog/software-engineer-resume/): a one-page template, two annotated examples and advice for each section
- [Computer science resume](https://resumematcher.fyi/blog/computer-science-resume/): for students and new grads, built from projects and internships
- [FAANG resume](https://resumematcher.fyi/blog/faang-resume/): what Google, Meta and Amazon say they screen for, from their own careers pages
- [LaTeX resume](https://resumematcher.fyi/blog/latex-resume/): Jake's, sb2nov and Awesome-CV, Overleaf, and how a parser reads the PDF
- [Open source resume builders](https://resumematcher.fyi/blog/open-source-resume-builders/): Reactive Resume, RenderCV, YAMLResume, Awesome-CV and others compared
- [Master resume](https://resumematcher.fyi/blog/master-resume/): the one complete resume you tailor each application from
- [Tailor your resume to a job description](https://resumematcher.fyi/blog/how-to-match-your-resume-to-a-job-description/): the method, step by step
- [Private AI resume tailoring with Ollama](https://resumematcher.fyi/blog/local-ai-resume-tailoring-ollama/): keep your resume on your own machine

<a id="how-to-install"></a>

## How to Install

![Installation](assets/how_to_install_resumematcher.webp)

For detailed setup instructions, see **[SETUP.md](SETUP.md)** (English) or: [Español](SETUP.es.md), [简体中文](SETUP.zh-CN.md), [日本語](SETUP.ja.md).

### Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 24+ | [nodejs.org](https://nodejs.org) |
| uv | Latest | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### Quick Start

Fastest for MacOS, WSL and Ubuntu users:

```bash
# Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Configure your AI provider
uv sync                      # Install dependencies
uv run app

# Frontend (Terminal 2)
cd apps/frontend
npm install
npm run dev
```

Open **<http://localhost:3000>** and configure your AI provider in Settings.

**Windows 11:** see [Windows 11 Setup](SETUP.md#windows-11-setup) for PowerShell commands.

### Supported AI Providers

| Provider | Local/Cloud | Notes |
|----------|-------------|-------|
| **Your coding agent** | Local | No API key. Open Claude Code, Codex, Cursor or Copilot in this folder and ask it to set up Resume Matcher and tailor your resume: the agent does the AI work in its own app, and Resume Matcher stores, checks and renders the result for you to edit. Choose **Coding agent** in Settings. See [SETUP.md](SETUP.md#use-resume-matcher-with-a-coding-agent). |
| **Ollama** | Local | Free, runs on your machine |
| **Claude subscription (via Claude Code)** | Cloud (via local CLI) | Runs your installed `claude` CLI, so this app needs no API key and never sees or stores your Claude credentials, but prompts still go to Anthropic through your Claude Code login and count toward your plan's usage limits (Anthropic may draw them from usage credits instead). Anthropic doesn't allow third-party apps to route requests through Claude Free/Pro/Max plans, this option may count as one, and Anthropic can enforce that without notice; Settings asks you to accept that risk first. For guaranteed access, use the **Anthropic** provider with an API key, or let Claude Code do the work as [your coding agent](SETUP.md#use-resume-matcher-with-a-coding-agent). Set `LLM_PROVIDER=claude_cli`; pick the model in Settings or with `LLM_MODEL` (`fable`, `opus`, `sonnet`, `haiku` or a full `claude-…` name). Requires [Claude Code](https://claude.com/claude-code) installed and signed in (`claude auth login`); not available inside the Docker images. |
| **ChatGPT plan (Sign in with ChatGPT)** | Cloud | Community-built. Uses OpenAI's official [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source) (preview, may change) with ChatGPT Plus or Pro: choose **ChatGPT plan** in Settings and click **Continue with ChatGPT**; no API key needed. Requests go from your machine to OpenAI's Responses API and count toward your plan's limits (on Plus the five-hour limit is shared with your other apps; Pro has none). Sign in from a browser on the machine running the backend; the default Docker setup can't complete the sign-in (see [SETUP.md](SETUP.md#option-c-your-chatgpt-plan-sign-in-with-chatgpt)). For guaranteed access, use the **OpenAI** provider with an API key. Set `LLM_PROVIDER=chatgpt`. |
| **OpenAI** | Cloud | GPT-5 Nano, GPT-4o |
| **Anthropic** | Cloud | Claude Haiku 4.5 |
| **Google Gemini** | Cloud | Gemini 3 Flash |
| **OpenRouter** | Cloud | Access to multiple models |
| **DeepSeek** | Cloud | DeepSeek Chat |
| **Groq** | Cloud | Llama 3.3 70B, GPT-OSS |

### Docker Deployment

Official Docker images are published for `linux/amd64` and `linux/arm64` on:

- `ghcr.io/srbhr/resume-matcher`
- `srbhr/resume-matcher`

Run on a single public port (`3000`) with API available at `/api`:

```bash
docker run --name resume-matcher \
  -p 3000:3000 \
  -v resume-data:/app/backend/data \
  ghcr.io/srbhr/resume-matcher:latest
```

Prefer pinning a version in production, for example `ghcr.io/srbhr/resume-matcher:1.3.0` or
`ghcr.io/srbhr/resume-matcher:1.3`.

Endpoints:

- App: <http://localhost:3000>
- API health check: <http://localhost:3000/api/v1/health>
- API docs: <http://localhost:3000/docs>

> **Using Ollama with Docker?** Use `http://host.docker.internal:11434` as the Ollama URL instead of `localhost` (on Linux, Ollama must also listen beyond `127.0.0.1`; see [SETUP.md](SETUP.md#using-ollama-with-docker)). Docker publishes the app on `127.0.0.1` only; to open it from another device, see [SETUP.md](SETUP.md#opening-it-from-another-device).

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.13+, LiteLLM |
| Frontend | Next.js 16, React 19, TypeScript |
| Database | SQLite by default, optional PostgreSQL (SQLAlchemy 2.0) |
| Styling | Tailwind CSS 4, Swiss International Style |
| PDF | Headless Chromium via Playwright |

## Join Us and Contribute

![how to contribute](assets/how_to_contribute.webp)

We welcome contributions from everyone! Whether you're a developer, designer, or just someone who wants to help out. All the contributors are listed in the [about page](https://resumematcher.fyi/about) on our website and on the GitHub Readme here.

Check out the roadmap if you would like to work on the features that are planned for the future. If you have any suggestions or feature requests, please feel free to open an issue on GitHub and discuss it on our [Discord](https://dsc.gg/resume-matcher) server.

<a id="contributors"></a>

## Contributors

![Contributors](assets/contributors.webp)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

<br/>

<details>
  <summary><kbd>Star History</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## Resume Matcher is a part of [Vercel Open Source Program](https://vercel.com/oss)

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
