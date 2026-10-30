# Resume Matcher 安装与配置指南

[English](SETUP.md) | [Español](SETUP.es.md) | [**简体中文**](SETUP.zh-CN.md) | [日本語](SETUP.ja.md) | [Português (BR)](SETUP.pt-BR.md)

欢迎！本指南将带你在本地完成 Resume Matcher 的安装与配置。无论你是想参与开发，还是只想在本机运行应用，都可以按本文档完成上手。

---

## 目录

- [前置条件](#prerequisites)
- [快速开始](#quick-start)
- [Windows 11 安装](#windows-11-setup)
- [逐步安装](#step-by-step-setup)
  - [1. 克隆仓库](#1-clone-the-repository)
  - [2. 后端配置](#2-backend-setup)
  - [3. 前端配置](#3-frontend-setup)
- [配置 AI 提供商](#configuring-your-ai-provider)
  - [选项 A：云端提供商](#option-a-cloud-providers)
  - [选项 B：使用 Ollama 的本地 AI（免费）](#option-b-local-ai-with-ollama-free)
  - [选项 C：你的 ChatGPT 订阅（Sign in with ChatGPT）](#option-c-your-chatgpt-plan-sign-in-with-chatgpt)
- [Docker 部署](#docker-deployment)
- [访问应用](#accessing-the-application)
- [在 Claude Code 或 Claude Desktop 中使用 Resume Matcher（MCP）](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp)
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
| **Node.js** | 24+ | `node --version` | [nodejs.org](https://nodejs.org) |
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
uv run app

# 3. 启动前端（终端 2）
cd apps/frontend
npm install                  # 安装 Node.js 依赖
npm run dev                  # 启动开发服务器
```

浏览器打开 **<http://localhost:3000>** 即可。

> **注意：** 使用应用前需要先配置 AI 提供商。见下方 [配置 AI 提供商](#configuring-your-ai-provider)。

---

<a id="windows-11-setup"></a>
## Windows 11 安装

上文及本指南其余部分的命令使用的是 macOS/Linux 的 shell 语法。在 Windows 11 上，请改用本节中的 **PowerShell**（或 Windows Terminal）命令。

### 1. 安装前置条件

使用 `winget`（Windows 11 内置）安装 [前置条件](#prerequisites) 中的工具，然后**关闭并重新打开 PowerShell**，使它们出现在 `PATH` 中：

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
```

你也可以使用 [前置条件](#prerequisites) 表格中链接的安装程序。

### 2. 下载代码

可以使用 Git 克隆：

```powershell
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

或者不使用 Git：打开 [仓库页面](https://github.com/srbhr/Resume-Matcher)，点击 **Code → Download ZIP**，解压 ZIP，然后在 PowerShell 中 `cd` 进入解压后的文件夹。

### 3. 启动后端（PowerShell 窗口 1）

```powershell
cd apps\backend
Copy-Item .env.example .env   # 从模板创建配置
notepad .env                  # 编辑配置（见下文）
uv sync                       # 安装 Python 依赖
uv run app
```

在 `.env` 中，将 `HOST=0.0.0.0` 改为 `HOST=127.0.0.1`，这样后端只能从你自己的机器访问。默认值会监听所有网络接口，而 API 没有身份验证，因此同一网络中的其他设备可能会使用你配置的 AI 提供商。你也可以在这里设置 AI 提供商，并设置 `RELOAD=true` 以便在代码变更时自动重载。

### 4. 启动前端（PowerShell 窗口 2）

新打开的 PowerShell 窗口位于你的主目录，因此请先切换到克隆或解压 Resume Matcher 的文件夹（将路径替换为你自己的）：

```powershell
cd C:\path\to\Resume-Matcher
cd apps\frontend
npm install
npm run dev
```

在浏览器中打开 **<http://localhost:3000>**。

> **PDF 导出：** Resume Matcher 使用无头 Chromium 渲染 PDF。如果未安装 Playwright 的浏览器，后端会回退到已安装的 Microsoft Edge 或 Google Chrome（Windows 11 自带 Edge）。你也可以在 `apps\backend` 中运行 `uv run playwright install chromium` 来安装 Playwright 的 Chromium。

> **更喜欢 Docker？** 请安装 [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)，并按照 [Docker 部署](#docker-deployment) 操作。要在 PowerShell 中设置 `PORT` 之类的变量，请使用 `$env:PORT="4000"; docker compose up -d`。对于 [可选的 PostgreSQL 配置](#optional-postgresql)，运行 `$env:POSTGRES_PASSWORD=[guid]::NewGuid().ToString('N'); docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`；在 Docker 之外，请在 `apps\backend\.env` 中设置 `DATABASE_URL`。

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
LLM_MODEL=gpt-5-nano-2025-08-07
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
RELOAD=true uv run app
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
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-5-nano-2025-08-07` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **OpenAI-Compatible** | `LLM_PROVIDER=openai_compatible`<br>`LLM_MODEL=llama-3.1-8b`<br>`LLM_API_BASE=http://localhost:8080/v1` | —（本地） |

**OpenAI-Compatible** 适用于任何暴露 OpenAI Chat Completions API 的本地服务器，例如 llama.cpp、vLLM、LM Studio 等。API Key 可选。

Anthropic 的 `.env` 示例：

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>
### 选项 B：使用 Ollama 的本地 AI（免费）

想在本机运行模型、避免 API 费用？可以使用 Ollama。

#### 第 1 步：安装 Ollama

从 [ollama.com](https://ollama.com) 下载并安装。

#### 第 2 步：拉取模型

```bash
ollama pull gemma3:4b
```

其他可选模型：`mistral`、`codellama`、`neural-chat`

#### 第 3 步：配置 `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# Ollama 不需要 LLM_API_KEY
```

#### 第 4 步：确保 Ollama 正在运行

```bash
ollama serve
```

通常安装后 Ollama 会自动启动。

<a id="option-c-your-chatgpt-plan-sign-in-with-chatgpt"></a>
### 选项 C：你的 ChatGPT 订阅（Sign in with ChatGPT）

一个由社区贡献的提供商，使用 OpenAI 官方的 [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source)（目前为预览版，可能会有变化）。它适用于 ChatGPT Plus 和 Pro，无需 API Key，请求会从你的机器直接发送到 OpenAI 的 Responses API。用量计入你的 ChatGPT 订阅限额：Plus 的五小时限额与你其他使用该订阅的应用共享；Pro 没有五小时限额。如需稳定可用，请改用 OpenAI API Key。

1. 启动后端和前端，然后在**与后端同一台机器上的**浏览器中打开 **Settings**。
2. 选择 **ChatGPT plan**，点击 **Continue with ChatGPT**。
3. 在 OpenAI 登录，并允许 Resume Matcher 使用你的 ChatGPT 订阅。首次使用时，OpenAI 会为你的账户注册该应用；之后的登录会复用该注册。
4. 你会回到 Settings。从你账户可用的模型中选择一个，然后点击 **Save**。

OpenAI 会将浏览器重定向到 `http://127.0.0.1:<port>/auth/callback`，其中 `<port>` 是你打开 Resume Matcher 时使用的端口（默认为 `3000`）。前端会把该路径转发给后端，而后端只接受来自其所在机器的该回调。因此，浏览器必须运行在运行 Resume Matcher 的那台机器上，并且你应以 `http://localhost:<port>` 或 `http://127.0.0.1:<port>` 的形式打开它。令牌加密存储在后端数据目录中（`chatgpt_credentials.enc`）。**Disconnect** 会在 OpenAI 端撤销会话并删除令牌；**Manage usage** 会打开你的 ChatGPT 用量设置。

**Docker：** 使用只发布 3000 端口的默认配置即可完成登录：请在运行容器的机器上，通过 `http://localhost:3000`（或你发布的 `PORT`）打开 Resume Matcher。OpenAI 会把浏览器带回同一个端口，前端再把 `/auth/callback` 转发给容器内的后端。从另一台电脑或通过反向代理域名访问时无法使用，因为 OpenAI 只允许 `http://127.0.0.1` 的重定向。

等效的 `.env`（仍需在 Settings 中登录）：

```env
LLM_PROVIDER=chatgpt
LLM_MODEL=gpt-6.1-sol  # 替换为 Settings 中你账户模型列表里的模型
```

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

<a id="optional-postgresql"></a>
### 可选：PostgreSQL

SQLite 是默认选项，无需任何设置。如果需要备份，或想把数据库放在你自己掌控的另一台服务器上，可以改用 PostgreSQL。

> **安全提示：** Resume Matcher 没有用户账户，也没有身份验证，PostgreSQL 同样不会增加这些功能。请仅供自己使用，或只在可信的私有网络中运行，切勿暴露到公网。除本地使用之外，请使用最小权限的数据库角色连接（Compose 文件中的 `resume` 用户是超级用户）。

使用 Docker Compose 启动：

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

`POSTGRES_PASSWORD` 会原样复制到 `DATABASE_URL` 中，因此请使用对 URL 安全的密码（字母、数字、`-._~`），可用 `openssl rand -hex 32` 生成。不要使用容易被猜到的值。请保存好这个密码：PostgreSQL 会在首次启动时把它存入 `postgres-data` 卷，之后每次执行 `docker compose` 命令都需要相同的值（重新 export，或在 `docker-compose.yml` 同目录的 `.env` 文件中写入 `POSTGRES_PASSWORD=...`）。

在 Docker 之外，请在 `apps/backend/.env` 中设置 `DATABASE_URL=postgresql://user:password@host:5432/dbname`（以及可选的 `DATABASE_SCHEMA`），并对密码中的特殊字符进行百分号编码。对于远程数据库，请在 URL 末尾加上 `?sslmode=require`。数据表会在启动时创建。

要迁移本地安装中的现有数据，请在设置好 `DATABASE_URL` 的情况下，在 `apps/backend` 中运行 `uv run python -m app.scripts.copy_sqlite_to_postgres`。其默认的 `--source` 是 `apps/backend/data/resume_matcher.db`，该文件只存在于本地安装中；如需使用其他 SQLite 文件，请传入 `--source <file>`。如果目标数据库非空，脚本会拒绝写入。请先停止应用：复制开始之后产生的写入不会被复制。

Docker 安装会把 SQLite 数据库保存在 `resume-data` 卷中，而不是主机上。请先停止应用，然后在容器内运行该脚本，此时该卷就是默认的源（需先设置与上文相同的 `POSTGRES_PASSWORD`）：

```bash
docker compose stop
docker compose -f docker-compose.yml -f docker-compose.postgres.yml run --rm -w /app/backend resume-matcher python -m app.scripts.copy_sqlite_to_postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

或者，从已停止的容器中把文件复制出来（`docker cp resume-matcher:/app/backend/data/resume_matcher.db .`），然后在能够连接到该数据库的主机上通过 `--source ./resume_matcher.db` 传入。请保留 `data/.secret_key`（它仍留在卷中）：它用于解密你已保存的 API Key。

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

<a id="use-resume-matcher-from-claude-code-or-claude-desktop-mcp"></a>
## 在 Claude Code 或 Claude Desktop 中使用 Resume Matcher（MCP）

Resume Matcher 内置了一个 [MCP](https://modelcontextprotocol.io) 服务器，可让 Claude Code、Claude Desktop、Cursor 或 Codex 直接驱动它。它通过 stdio 运行，**无需 LLM API Key**：内容由 Claude 撰写，Resume Matcher 负责存储、校验、评分和渲染。它与 Web 应用共享同一个数据库，因此 Claude 保存的内容会显示在 UI 中。

**前置条件：** 本地（非 Docker）安装。克隆仓库并运行 `cd apps/backend && uv sync`（参见 [后端配置](#2-backend-setup)）。

### Claude Code

```bash
claude mcp add resume-matcher -- uv run --directory /abs/path/to/Resume-Matcher/apps/backend resume-matcher-mcp
```

### Claude Desktop

将以下内容添加到 `claude_desktop_config.json`（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`，Windows：`%APPDATA%\Claude\claude_desktop_config.json`），然后重启 Claude Desktop：

```json
{
  "mcpServers": {
    "resume-matcher": {
      "command": "/absolute/path/to/uv",
      "args": ["run", "--directory", "/abs/path/to/Resume-Matcher/apps/backend", "resume-matcher-mcp"]
    }
  }
}
```

`command` 请使用 `uv` 的**绝对路径**（在 macOS/Linux 上用 `which uv` 查找，在 Windows 上用 `where.exe uv`）。Claude Desktop 不会继承你的 shell `PATH`，所以只写 `uv` 会找不到。在 Windows 上，JSON 路径中的反斜杠需要写两遍。

### 其他 MCP 客户端

Cursor、Codex 和其他客户端使用相同的命令（`uv`）和参数（`run --directory <path>/apps/backend resume-matcher-mcp`）。

### 注意事项

- **同一份代码，同一份数据。** 请从同一份代码目录运行 Web 应用，这样两者使用同一个数据库。`DATA_DIR` 可以移动 SQLite 文件；`DATABASE_URL` 则改为选用 [PostgreSQL](#optional-postgresql)。
- **PDF 和 verify 需要前端。** PDF 导出、`verify_resume`、`tailor_and_verify` 和 `parse_check_resume` 需要前端处于运行状态（默认 <http://localhost:3000>，可通过 `FRONTEND_BASE_URL` 设置）。其他工具无需前端即可使用。
- **暂不支持 Docker。** 应用的数据库位于 Docker 卷中，因此在主机上启动的服务器看到的会是一个空数据库。

该服务器提供的工具可用于列出和读取简历与职位描述、创建主简历、添加职位描述、定制并验证简历（`tailor_and_verify`）、进行 ATS 解析检查并评分、导出 PDF（`export_resume_pdf`）以及管理投递记录。连接后客户端会列出这些工具，服务器内置的说明也会引导 Claude 完成整个流程。

---

<a id="common-commands-reference"></a>
## 常用命令速查

### 后端命令

```bash
cd apps/backend

# 启动开发服务器（自动热重载）
RELOAD=true uv run app

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

# 使用 Oxfmt 格式化
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
3. 确认模型已下载：`ollama pull gemma3:4b`

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
- **项目文档：** 查看[在线文档](https://resumematcher.fyi/docs/)获取更详细的指南

---

祝你简历制作顺利！如果 Resume Matcher 对你有帮助，欢迎 [给仓库点个 Star](https://github.com/srbhr/Resume-Matcher)，以及 [加入我们的 Discord](https://dsc.gg/resume-matcher)。

