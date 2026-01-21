<div align="center">

[![Resume Matcher](assets/header.png)](https://www.resumematcher.fyi)

# Resume Matcher

[English](README.md) | [Español](README.es.md) | **简体中文** | [日本語](README.ja.md)

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](https://resumematcher.fyi/docs/installation) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝚂𝚙𝚘𝚗𝚜𝚘𝚛](#sponsor-resume-matcher) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/srbhrai) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/) ✦ [𝙲𝚛𝚎𝚊𝚝𝚘𝚛](https://srbhr.com)

为每一次求职投递生成量身定制的简历：AI 给出可执行的优化建议。支持本地使用 Ollama 运行，也可通过 API 连接你常用的 LLM 提供商。

![Resume Matcher Demo](assets/Resume_Matcher_Demo_2.gif)

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
> 本项目处于活跃开发中。新功能会持续添加，我们也欢迎社区贡献。如果你有建议或功能需求，欢迎在 GitHub 提 Issue，或加入我们的 [Discord](https://dsc.gg/resume-matcher) 讨论。

## 快速开始

Resume Matcher 的工作方式是先建立一份“主简历”，然后针对每个职位描述进行定制。安装说明见：[如何安装](#how-to-install)

### 工作流程

1. **上传**你的主简历（PDF 或 DOCX）
2. **粘贴**你要投递的职位描述（JD）
3. **审阅**AI 生成的改进建议与定制内容
4. **生成**该岗位的求职信与邮件模板
5. **自定义**版式与章节，匹配你的风格
6. **导出**为你选定模板的专业 PDF

### 保持联系

[![Discord](assets/resume_matcher_discord.png)](https://dsc.gg/resume-matcher)

加入我们的 [Discord](https://dsc.gg/resume-matcher)，参与讨论、功能需求与社区支持。

[![LinkedIn](assets/resume_matcher_linkedin.png)](https://www.linkedin.com/company/resume-matcher/)

关注我们的 [LinkedIn](https://www.linkedin.com/company/resume-matcher/) 获取更新。

![Star Resume Matcher](assets/star_resume_matcher.png)

给仓库点 Star 来支持开发，并及时获取新版本通知。

## 赞助商

![sponsors](assets/sponsors.png)

感谢赞助商帮助项目持续推进。如果你觉得 Resume Matcher 有帮助，欢迎通过 [**GitHub Sponsors**](https://github.com/sponsors/srbhr) 支持我们，以便持续迭代与改进。

| Sponsor | Description |
|---------|-------------|
| [APIDECK](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | One API to connect your app to 200+ SaaS platforms (accounting, HRIS, CRM, file storage). Build integrations once, not 50 times. 🌐 [apideck.com](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Vercel](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Resume Matcher 是 Vercel OSS // Summer 2025 计划的一部分 🌐 [vercel.com](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Cubic 为 Resume Matcher 提供 PR 审查 🌐 [cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Kilo Code](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Kilo Code 为 Resume Matcher 提供 AI 代码审查和编码积分 🌐 [kilo.ai](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |

<a id="support-the-development-by-donating"></a>

## 赞助 Resume Matcher

![donate](assets/supporting_resume_matcher.png)

请阅读我们的 [Sponsorship Guide](https://resumematcher.fyi/docs/sponsoring) 了解您的赞助如何帮助本项目。您将在 ReadME 和我们的网站上获得特别鸣谢。

| 平台  | 链接 |
|------|------|
| GitHub | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

## 创作者留言

感谢您关注 Resume Matcher。如果您想联系、合作或只是打个招呼，请随时联系我！
~ **Saurabh Rai** ✨

您可以在以下平台关注我：

- Website: [https://srbhr.com](https://srbhr.com)
- Linkedin: [https://www.linkedin.com/in/srbhr/](https://www.linkedin.com/in/srbhr/)
- Twitter: [https://twitter.com/srbhrai](https://twitter.com/srbhrai)
- GitHub: [https://github.com/srbhr](https://github.com/srbhr)

## 主要功能

![resume_matcher_features](assets/features.png)

### 核心能力

**主简历（Master Resume）**：基于你现有简历创建一份完整的主简历，后续每次投递都从这份主简历中抽取与定制。

![Job Description Input](assets/step_2_zh-CN.png)

### 简历生成器

![Resume Builder](assets/step_5_zh-CN.png)

粘贴职位描述后，获得针对该岗位定制的 AI 简历建议。

你可以：

- 修改建议内容
- 添加/移除章节
- 通过拖拽调整章节顺序
- 从多种简历模板中选择

### 求职信与邮件生成器

基于职位描述与你的简历，生成定制化的求职信与邮件模板。

![Cover Letter](assets/cover_letter_zh-CN.png)

### 简历评分（开发中功能）

我们正在开发“简历评分”功能：对比你的简历与职位描述，输出匹配分数，并给出改进建议。

![Resume Scoring and Keyword Highlight](assets/keyword_highlighter_zh-CN.png)

### PDF 导出

将定制后的简历与求职信导出为 PDF。

### 模板

| 模板名称 | 预览 | 说明 |
|---------|------|------|
| **经典单栏** | ![Classic Template](assets/pdf-templates/single-column.jpg) | 传统且干净的排版，适用于大多数行业。[查看 PDF](assets/pdf-templates/single-column.pdf) |
| **现代单栏** | ![Modern Template](assets/pdf-templates/modern-single-column.jpg) | 更强调可读性与审美的现代风格。[查看 PDF](assets/pdf-templates/modern-single-column.pdf) |
| **经典双栏** | ![Classic Two Column Template](assets/pdf-templates/two-column.jpg) | 将内容分区展示，更清晰易扫读。[查看 PDF](assets/pdf-templates/two-column.pdf) |
| **现代双栏** | ![Modern Two Column Template](assets/pdf-templates/modern-two-column.jpg) | 利用双栏结构做更强的信息组织。[查看 PDF](assets/pdf-templates/modern-two-column.pdf) |

### 国际化

- **多语言 UI**：界面支持英语、西班牙语、中文与日语
- **多语言内容**：可按你偏好的语言生成简历与求职信

### 路线图

如果你有建议或功能需求，欢迎在 GitHub 提 Issue，或加入我们的 [Discord](https://dsc.gg/resume-matcher) 讨论。

- 可视化关键词高亮
- 用于打造量化、可落地简历内容的 AI 画布（AI Canvas）
- 多职位描述联合优化

<a id="how-to-install"></a>

## 如何安装

![Installation](assets/how_to_install_resumematcher.png)

更详细的安装与配置说明请查看 **[安装文档](SETUP.zh-CN.md)**（也提供 [English](SETUP.md) / [Español](SETUP.es.md) / [日本語](SETUP.ja.md)）。

### 前置条件

| 工具 | 版本 | 安装 |
|------|------|------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| uv | 最新版 | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### 快速开始

适用于 MacOS、WSL 与 Ubuntu 的最快方式：

```bash
# 克隆仓库
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 后端（终端 1）
cd apps/backend
cp .env.example .env        # 配置你的 AI 提供商
uv sync                      # 安装依赖
uv run uvicorn app.main:app --reload --port 8000

# 前端（终端 2）
cd apps/frontend
npm install
npm run dev
```

打开 **<http://localhost:3000>**，并在 Settings 中配置你的 AI 提供商。

### 支持的 AI 提供商

| 提供商 | 本地/云 | 说明 |
|--------|---------|------|
| **Ollama** | 本地 | 免费，在你的机器上运行 |
| **OpenAI** | 云 | GPT-4o、GPT-4o-mini |
| **Anthropic** | 云 | Claude 3.5 Sonnet |
| **Google Gemini** | 云 | Gemini 1.5 Flash/Pro |
| **OpenRouter** | 云 | 访问多种模型 |
| **DeepSeek** | 云 | DeepSeek Chat |

### Docker 部署

```bash
docker pull srbhr/resume-matcher:latest

docker run srbhr/resume-matcher:latest
```

<!-- 注意：Docker 文档正在编写中。目前请参考 docker-compose.yml -->

> **在 Docker 中使用 Ollama？** 将 Ollama URL 配置为 `http://host.docker.internal:11434`（而不是 `localhost`）。

### 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | FastAPI、Python 3.13+、LiteLLM |
| 前端 | Next.js 15、React 19、TypeScript |
| 数据库 | TinyDB（JSON 文件存储） |
| 样式 | Tailwind CSS 4、Swiss International Style |
| PDF | Playwright 驱动的无头 Chromium |

## 参与贡献

![how to contribute](assets/how_to_contribute.png)

我们欢迎所有人的贡献！无论你是开发者、设计师，还是希望帮忙的用户。所有贡献者都会展示在我们官网的 [about 页面](https://resumematcher.fyi/about)，也会显示在 GitHub README 中。

如果你希望参与未来规划的功能，可以先看看路线图。若你有建议或功能需求，欢迎在 GitHub 提 Issue，并在我们的 [Discord](https://dsc.gg/resume-matcher) 讨论。

<a id="contributors"></a>

## 贡献者

![Contributors](assets/contributors.png)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

<br/>

<details>
  <summary><kbd>Star 历史</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://api.star-history.com/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## Resume Matcher 是 [Vercel Open Source Program](https://vercel.com/oss) 的一部分

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
