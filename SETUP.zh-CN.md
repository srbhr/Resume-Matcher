# Resume Matcher 安装与配置指南

[English](SETUP.md) | [Español](SETUP.es.md) | [**简体中文**](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

欢迎！本指南将带你在本地完成 Resume Matcher 的安装与配置。无论你是想参与开发，还是只想在本机运行应用，都可以按本文档完成上手。

---

## 目录

- [前置条件](#prerequisites)
- [快速开始](#quick-start)
- [逐步安装](#step-by-step-setup)
  - [1. 克隆仓库](#1-clone-the-repository)
  - [2. 后端配置](#2-backend-setup)
  - [3. 前端配置](#3-frontend-setup)
- [配置 AI 提供商](#configuring-your-ai-provider)
  - [选项 A：云端提供商](#option-a-cloud-providers)
  - [选项 B：使用 Ollama 的本地 AI（免费）](#option-b-local-ai-with-ollama-free)
- [Docker 部署](#docker-deployment)
- [访问应用](#accessing-the-application)
- [常用命令速查](#common-commands-reference)
- [故障排查](#troubleshooting)
- [项目结构概览](#project-structure-overview)
- [获取帮助](#getting-help)

---

<a id="prerequisites"></a>
## 前置条件

开始前请确保系统已安装以下工具：

| 工具 | 最低版本 | 如何检查 | 安装 |
|------|----------|----------|------|
| **Python** | 3.13+ | `python --version` | [python.org](https://python.org) |
| **Node.js** | 22+ | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | 10+ | `npm --version` | 随 Node.js 一起安装 |
| **uv** | 最新 | `uv --version` | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git** | 任意 | `git --version` | [git-scm.com](https://git-scm.com) |

### 安装 uv（Python 包管理器）

Resume Matcher 使用 `uv` 来实现更快、更稳定的 Python 依赖管理。可通过以下方式安装：

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 或通过 pip
pip install uv
```

---

<a id="quick-start"></a>
## 快速开始

如果你对开发工具比较熟悉，想快速跑起来：

```bash
# 1. 克隆仓库
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 2. 启动后端（终端 1）
cd apps/backend
cp .env.example .env        # 从模板创建配置
uv sync                      # 安装 Python 依赖
uv run uvicorn app.main:app --reload --port 8000

# 3. 启动前端（终端 2）
cd apps/frontend
npm install                  # 安装 Node.js 依赖
npm run dev                  # 启动开发服务器
```

浏览器打开 **<http://localhost:3000>** 即可。

> **注意：** 使用应用前需要先配置 AI 提供商。见下方 [配置 AI 提供商](#configuring-your-ai-provider)。

---

<a id="step-by-step-setup"></a>
## 逐步安装

<a id="1-clone-the-repository"></a>
### 1. 克隆仓库

先把代码拉到本机：

```bash
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

<a id="2-backend-setup"></a>
### 2. 后端配置

后端是 Python FastAPI 应用，负责 AI 调用、简历解析以及数据存储。

#### 进入后端目录

```bash
cd apps/backend
```

#### 创建环境变量文件

```bash
cp .env.example .env
```

#### 使用你偏好的编辑器编辑 `.env`

```bash
# macOS/Linux
nano .env

# 或使用任意编辑器
code .env   # VS Code
```

最关键的配置是 AI 提供商。下面是 OpenAI 的最小示例配置：

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-your-api-key-here

# 本地开发建议保持默认
HOST=0.0.0.0
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### 安装 Python 依赖

```bash
uv sync
```

该命令会创建虚拟环境并安装所有必需依赖。

#### 启动后端服务

```bash
uv run uvicorn app.main:app --reload --port 8000
```

你会看到类似输出：

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**保持该终端运行**，然后为前端另开一个终端窗口。

<a id="3-frontend-setup"></a>
### 3. 前端配置

前端是 Next.js 应用，提供用户界面。

#### 进入前端目录

```bash
cd apps/frontend
```

#### （可选）创建前端环境变量文件

仅当你的后端运行在不同端口时需要：

```bash
cp .env.sample .env.local
```

#### 安装 Node.js 依赖

```bash
npm install
```

#### 启动开发服务器

```bash
npm run dev
```

你会看到：

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

浏览器打开 **<http://localhost:3000>**，你应该能看到 Resume Matcher 的界面。

---

<a id="configuring-your-ai-provider"></a>
## 配置 AI 提供商

Resume Matcher 支持多种 AI 提供商。你可以在应用的 Settings 页面中配置，也可以直接编辑后端的 `.env` 文件。

<a id="option-a-cloud-providers"></a>
### 选项 A：云端提供商

| 提供商 | 配置方式 | 获取 API Key |
|--------|----------|--------------|
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-3-5-sonnet-20241022` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-1.5-flash` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=anthropic/claude-3.5-sonnet` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |

Anthropic 的 `.env` 示例：

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>
### 选项 B：使用 Ollama 的本地 AI（免费）

想在本机运行模型、避免 API 费用？可以使用 Ollama。

#### 第 1 步：安装 Ollama

从 [ollama.com](https://ollama.com) 下载并安装。

#### 第 2 步：拉取模型

```bash
ollama pull llama3.2
```

其他可选模型：`mistral`、`codellama`、`neural-chat`

#### 第 3 步：配置 `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_API_BASE=http://localhost:11434
# Ollama 不需要 LLM_API_KEY
```

#### 第 4 步：确保 Ollama 正在运行

```bash
ollama serve
```

通常安装后 Ollama 会自动启动。

---

<a id="docker-deployment"></a>
## Docker 部署

如果你更喜欢容器化部署，Resume Matcher 已提供 Docker 支持。

### 使用 Docker Compose（推荐）

```bash
# 构建并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止容器
docker-compose down
```

### Docker 重要说明

- **API Key 通过 UI 配置**：<http://localhost:3000/settings>（不是通过 `.env` 文件）
- 数据会保存在 Docker volume 中
- 暴露前端（3000）与后端（8000）端口

<!-- 注意：Docker 文档正在编写中。目前请参考 docker-compose.yml -->

---

<a id="accessing-the-application"></a>
## 访问应用

当后端与前端都启动后，可通过以下地址访问：

| URL | 说明 |
|-----|------|
| **<http://localhost:3000>** | 主应用（Dashboard） |
| **<http://localhost:3000/settings>** | 配置 AI 提供商 |
| **<http://localhost:8000>** | 后端 API 根路径 |
| **<http://localhost:8000/docs>** | 可交互的 API 文档 |
| **<http://localhost:8000/health>** | 后端健康检查 |

### 首次配置检查清单

1. 打开 <http://localhost:3000/settings>
2. 选择你的 AI 提供商
3. 填写 API Key（或配置 Ollama）
4. 点击 “Save Configuration”
5. 点击 “Test Connection” 验证连通性
6. 回到 Dashboard，上传你的第一份简历

---

<a id="common-commands-reference"></a>
## 常用命令速查

### 后端命令

```bash
cd apps/backend

# 启动开发服务器（自动热重载）
uv run uvicorn app.main:app --reload --port 8000

# 启动生产服务器
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 安装依赖
uv sync

# 安装开发依赖（用于测试）
uv sync --group dev

# 运行测试
uv run pytest

# 查看数据库文件（JSON 存储）
ls -la data/
```

### 前端命令

```bash
cd apps/frontend

# 启动开发服务器（Turbopack 快速刷新）
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm run start

# 运行 linter
npm run lint

# 使用 Prettier 格式化
npm run format

# 指定其他端口运行
npm run dev -- -p 3001
```

### 数据库管理

Resume Matcher 使用 TinyDB（JSON 文件存储）。数据位于 `apps/backend/data/`：

```bash
# 查看数据库文件
ls apps/backend/data/

# 备份数据
cp -r apps/backend/data apps/backend/data-backup

# 重置数据（重新开始）
rm -rf apps/backend/data
```

---

<a id="troubleshooting"></a>
## 故障排查

### 后端无法启动

**错误：** `ModuleNotFoundError`

确认使用 `uv` 启动：

```bash
uv run uvicorn app.main:app --reload
```

**错误：** `LLM_API_KEY not configured`

检查你的 `.env` 是否为所选提供商配置了有效的 API Key。

### 前端无法启动

**错误：** 页面加载时报 `ECONNREFUSED`

后端未运行，请先启动后端：

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**错误：** 构建或 TypeScript 报错

清理 Next.js 缓存：

```bash
rm -rf apps/frontend/.next
npm run dev
```

### PDF 下载失败

**错误：** `Cannot connect to frontend for PDF generation`

后端无法访问前端，请检查：

1. 前端正在运行
2. `.env` 中的 `FRONTEND_BASE_URL` 与前端 URL 一致
3. `CORS_ORIGINS` 包含前端 URL

如果前端运行在 3001 端口：

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Ollama 连接失败

**错误：** `Connection refused to localhost:11434`

1. 确认 Ollama 在运行：`ollama list`
2. 如有需要手动启动：`ollama serve`
3. 确认模型已下载：`ollama pull llama3.2`

---

<a id="project-structure-overview"></a>
## 项目结构概览

```text
Resume-Matcher/
├─ apps/
│  ├─ backend/                 # Python FastAPI backend
│  │  ├─ app/
│  │  │  ├─ main.py            # Application entry point
│  │  │  ├─ config.py          # Environment configuration
│  │  │  ├─ database.py        # TinyDB wrapper
│  │  │  ├─ llm.py             # AI provider integration
│  │  │  ├─ routers/           # API endpoints
│  │  │  ├─ services/          # Business logic
│  │  │  └─ schemas/           # Data models
│  │  ├─ prompts/              # LLM prompt templates
│  │  ├─ data/                 # Database storage (auto-created)
│  │  ├─ .env.example          # Environment template
│  │  └─ pyproject.toml        # Python dependencies
│  └─ frontend/                # Next.js React frontend
│     ├─ app/                  # Pages (dashboard, builder, etc.)
│     ├─ components/           # Reusable React components
│     ├─ lib/                  # Utilities and API client
│     ├─ .env.sample           # Environment template
│     └─ package.json          # Node.js dependencies
├─ docs/                        # Additional documentation
├─ docker-compose.yml           # Docker configuration
├─ Dockerfile                   # Container build instructions
└─ README.md                    # Project overview
```

---

<a id="getting-help"></a>
## 获取帮助

如果遇到问题，可以从以下渠道获得支持：

- **Discord 社区：** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - 提问与讨论都很活跃
- **GitHub Issues：** [提交 Issue](https://github.com/srbhr/Resume-Matcher/issues) 反馈 bug 或提出需求
- **项目文档：** 查看 [docs/agent/](docs/agent/) 获取更详细的指南

### 推荐文档

| 文档 | 说明 |
|------|------|
| [backend-guide.md](docs/agent/architecture/backend-guide.md) | 后端架构与 API 细节 |
| [frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) | 用户流程与组件架构 |
| [style-guide.md](docs/agent/design/style-guide.md) | UI 设计系统（Swiss International Style） |

---

祝你简历制作顺利！如果 Resume Matcher 对你有帮助，欢迎 [给仓库点个 Star](https://github.com/srbhr/Resume-Matcher)，以及 [加入我们的 Discord](https://dsc.gg/resume-matcher)。

