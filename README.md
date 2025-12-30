<div align="center">

[![Resume Matcher](assets/page_2.png)](https://www.resumematcher.fyi)

# Resume Matcher

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](#how-to-install) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝙳𝚘𝚗𝚊𝚝𝚎](#support-the-development-by-donating) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/ssrbhr) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/)

**Stop getting auto-rejected by ATS bots.** Resume Matcher is the AI-powered platform that reverse-engineers hiring algorithms to show you exactly how to tailor your resume. Get the keywords, formatting, and insights that actually get you past the first screen and into human hands.

Hoping to make this, **VS Code for making resumes**.

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![version](https://img.shields.io/badge/Version-1.0%20Aerodynamic%20-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)

[![Discord](https://img.shields.io/discord/1122069176962531400?labelColor=F0F0E8&logo=discord&logoColor=1d4ed8&style=for-the-badge&color=1d4ed8)](https://dsc.gg/resume-matcher) [![Website](https://img.shields.io/badge/website-Resume%20Matcher-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)](https://resumematcher.fyi) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Resume%20Matcher-FFF?labelColor=F0F0E8&logo=LinkedIn&style=for-the-badge&color=1d4ed8)](https://www.linkedin.com/company/resume-matcher/)

<a href="https://trendshift.io/repositories/565" target="_blank"><img src="https://trendshift.io/api/badge/repositories/565" alt="srbhr%2FResume-Matcher | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)

</div>

> \[!IMPORTANT]
>
> This project is in active development. New features are being added continuously, and we welcome contributions from the community. There are some breaking changes on the `main` branch. If you have any suggestions or feature requests, please feel free to open an issue on GitHub or discuss it on our [Discord](https://dsc.gg/resume-matcher) server.

## Getting Started

Resume Matcher helps you optimize your resume to highlight skills and experience that resonate with potential employers. Upload your resume, paste a job description, and let AI tailor your content.

### How It Works

1. **Upload** your master resume (PDF or DOCX)
2. **Paste** a job description you're targeting
3. **Review** AI-generated improvements and tailored content
4. **Export** as a professional PDF with your preferred template

### Stay Connected

[![Discord](assets/resume_matcher_discord.png)](https://dsc.gg/resume-matcher)

Join our [Discord](https://dsc.gg/resume-matcher) for discussions, feature requests, and community support.

[![LinkedIn](assets/resume_matcher_linkedin.png)](https://www.linkedin.com/company/resume-matcher/)

Follow us on [LinkedIn](https://www.linkedin.com/company/resume-matcher/) for updates.

![Star Resume Matcher](assets/star_resume_matcher.png)

Star the repo to support development and get notified of new releases.

## Key Features

![resume_matcher_features](assets/resume_matcher_features.png)

### Core Features
- **Resume Tailoring**: AI-powered optimization of your resume for specific job descriptions
- **Multi-Provider LLM Support**: Works with OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, and Ollama
- **Works Locally**: Run everything on your machine with Ollama - no API costs required
- **PDF Export**: Professional PDF generation with customizable templates

### Resume Builder
- **Two Template Styles**: Single-column (traditional) and two-column (modern) layouts
- **Custom Sections**: Add, rename, reorder, and hide sections to match your needs
- **Formatting Controls**: Adjust margins, spacing, fonts, and more
- **Live Preview**: See changes instantly with paginated preview

### AI-Powered Content
- **Cover Letter Generation**: Auto-generate tailored cover letters for each job application
- **Outreach Messages**: Generate cold outreach messages for networking
- **Keyword Optimization**: Align your resume with job keywords and highlight relevant experience
- **Guided Improvements**: Get actionable suggestions to make your resume stand out

### Internationalization
- **Multi-Language UI**: Interface available in English, Spanish, Chinese, and Japanese
- **Multi-Language Content**: Generate resumes and cover letters in your preferred language

### Roadmap

If you have any suggestions or feature requests, please feel free to open an issue on GitHub or discuss it on our [Discord](https://dsc.gg/resume-matcher) server.

- Visual keyword highlighting
- AI Canvas for crafting impactful, metric-driven resume content
- Multi-job description optimization

## How to Install

![Installation](assets/how_to_install_resumematcher.png)

For detailed setup instructions, see the **[SETUP.md](SETUP.md)** guide.

### Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| uv | Latest | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Configure your AI provider
uv sync                      # Install dependencies
uv run uvicorn app.main:app --reload --port 8000

# Frontend (Terminal 2)
cd apps/frontend
npm install
npm run dev
```

Open **http://localhost:3000** and configure your AI provider in Settings.

### Supported AI Providers

| Provider | Local/Cloud | Notes |
|----------|-------------|-------|
| **Ollama** | Local | Free, runs on your machine |
| **OpenAI** | Cloud | GPT-4o, GPT-4o-mini |
| **Anthropic** | Cloud | Claude 3.5 Sonnet |
| **Google Gemini** | Cloud | Gemini 1.5 Flash/Pro |
| **OpenRouter** | Cloud | Access to multiple models |
| **DeepSeek** | Cloud | DeepSeek Chat |

### Docker Deployment

```bash
docker-compose up -d
```

See [docs/docker.md](docs/docker.md) for detailed Docker instructions.

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.13+, LiteLLM |
| Frontend | Next.js 15, React 19, TypeScript |
| Database | TinyDB (JSON file storage) |
| Styling | Tailwind CSS 4, Swiss International Style |
| PDF | Headless Chromium via Playwright |

## Join Us and Contribute

![how to contribute](assets/how_to_contribute.png)

We welcome contributions from everyone! Whether you're a developer, designer, or just someone who wants to help out. All the contributors are listed in the [about page](https://resumematcher.fyi/about) on our website and on the GitHub Readme here.

Check out the roadmap if you would like to work on the features that are planned for the future. If you have any suggestions or feature requests, please feel free to open an issue on GitHub and discuss it on our [Discord](https://dsc.gg/resume-matcher) server.

## Contributors

![Contributors](assets/contributors.png)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

## Support the Development by Donating

![donate](assets/supporting_resume_matcher.png)

If you would like to support the development of Resume Matcher, you can do so by donating. Your contributions will help us keep the project alive and continue adding new features.

| Platform  | Link                                   |
|-----------|----------------------------------------|
| GitHub    | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

<details>
  <summary><kbd>Star History</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://api.star-history.com/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## Resume Matcher is a part of [Vercel Open Source Program](https://vercel.com/oss)

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
