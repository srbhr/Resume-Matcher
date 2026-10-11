# Resume Matcher セットアップガイド

[English](SETUP.md) | [Español](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [**日本語**](SETUP.ja.md)

ようこそ！このガイドでは、ローカル環境で Resume Matcher をセットアップする手順を説明します。開発に参加したい方も、手元でアプリを動かしたい方も、この手順で始められます。

---

## 目次

- [前提条件](#prerequisites)
- [クイックスタート](#quick-start)
- [Windows 11 でのセットアップ](#windows-11-setup)
- [手順どおりにセットアップ](#step-by-step-setup)
  - [1. リポジトリをクローン](#1-clone-the-repository)
  - [2. バックエンドのセットアップ](#2-backend-setup)
  - [3. フロントエンドのセットアップ](#3-frontend-setup)
- [AI プロバイダの設定](#configuring-your-ai-provider)
  - [オプション A: クラウドプロバイダ](#option-a-cloud-providers)
  - [オプション B: Ollama によるローカル AI（無料）](#option-b-local-ai-with-ollama-free)
  - [オプション C: ChatGPT プラン（Sign in with ChatGPT）](#option-c-your-chatgpt-plan-sign-in-with-chatgpt)
- [Docker デプロイ](#docker-deployment)
- [アプリへのアクセス](#accessing-the-application)
- [Claude Code / Claude Desktop から Resume Matcher を使う（MCP）](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp)
- [よく使うコマンド](#common-commands-reference)
- [トラブルシューティング](#troubleshooting)
- [プロジェクト構成](#project-structure-overview)
- [ヘルプ](#getting-help)

---

<a id="prerequisites"></a>
## 前提条件

開始前に、以下がインストールされていることを確認してください：

| ツール | 最低バージョン | 確認方法 | インストール |
|------|----------------|----------|--------------|
| **Python** | 3.13+ | `python --version` | [python.org](https://python.org) |
| **Node.js** | 24+ | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | 10+ | `npm --version` | Node.js に同梱 |
| **uv** | 最新 | `uv --version` | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git** | 任意 | `git --version` | [git-scm.com](https://git-scm.com) |

### uv のインストール（Python パッケージマネージャ）

Resume Matcher は Python 依存関係の管理に `uv` を使用します。インストール方法：

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# または pip
pip install uv
```

---

<a id="quick-start"></a>
## クイックスタート

開発ツールに慣れていて、まず動かしたい方向け：

```bash
# 1. リポジトリをクローン
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 2. バックエンド起動（ターミナル 1）
cd apps/backend
cp .env.example .env        # テンプレートから設定を作成
uv sync                      # Python 依存関係をインストール
uv run app

# 3. フロントエンド起動（ターミナル 2）
cd apps/frontend
npm install                  # Node.js 依存関係をインストール
npm run dev                  # 開発サーバを起動
```

ブラウザで **<http://localhost:3000>** を開けば OK です。

> **注意:** 利用前に AI プロバイダの設定が必要です。下の [AI プロバイダの設定](#configuring-your-ai-provider) を参照してください。

---

<a id="windows-11-setup"></a>
## Windows 11 でのセットアップ

上記および本ガイドの他の箇所のコマンドは macOS/Linux のシェル構文です。Windows 11 では、代わりにこのセクションの **PowerShell**（または Windows Terminal）のコマンドを使ってください。

### 1. 前提ツールをインストール

[前提条件](#prerequisites) のツールを `winget`（Windows 11 に標準搭載）でインストールし、`PATH` に反映されるよう **PowerShell を閉じて開き直します**：

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
```

[前提条件](#prerequisites) の表にあるリンクのインストーラーを使うこともできます。

### 2. コードを取得

Git でクローンします：

```powershell
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

Git を使わない場合は、[リポジトリのページ](https://github.com/srbhr/Resume-Matcher) を開いて **Code → Download ZIP** をクリックし、ZIP を展開して、PowerShell で展開したフォルダへ `cd` します。

### 3. バックエンドを起動（PowerShell ウィンドウ 1）

```powershell
cd apps\backend
Copy-Item .env.example .env   # テンプレートから設定を作成
notepad .env                  # 設定を編集（下記参照）
uv sync                       # Python 依存関係をインストール
uv run app
```

`.env` で `HOST=0.0.0.0` を `HOST=127.0.0.1` に変更し、バックエンドを自分のマシンからのみ到達できるようにします。既定ではすべてのネットワークインターフェースで待ち受け、API には認証がないため、同じネットワーク上の他のデバイスから、設定済みの AI プロバイダを使われてしまう可能性があります。ここで AI プロバイダを設定することもでき、`RELOAD=true` を設定するとコード変更時に自動リロードされます。

### 4. フロントエンドを起動（PowerShell ウィンドウ 2）

新しい PowerShell ウィンドウはホームフォルダで開くため、まず Resume Matcher をクローンまたは展開したフォルダへ移動します（パスはご自身のものに置き換えてください）：

```powershell
cd C:\path\to\Resume-Matcher
cd apps\frontend
npm install
npm run dev
```

ブラウザで **<http://localhost:3000>** を開きます。

> **PDF エクスポート:** Resume Matcher はヘッドレス Chromium で PDF を生成します。Playwright のブラウザがインストールされていない場合、バックエンドはインストール済みの Microsoft Edge または Google Chrome にフォールバックします（Edge は Windows 11 に標準搭載です）。`apps\backend` で `uv run playwright install chromium` を実行して、Playwright の Chromium をインストールすることもできます。

> **Docker を使いたい場合:** [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) をインストールし、[Docker デプロイ](#docker-deployment) に従ってください。PowerShell で `PORT` などの変数を設定するには、`$env:PORT="4000"; docker compose up -d` を使います。[オプションの PostgreSQL 構成](#optional-postgresql) では、`$env:POSTGRES_PASSWORD="change-me"; docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d` を実行します。Docker を使わない場合は、`apps\backend\.env` に `DATABASE_URL` を設定します。

---

<a id="step-by-step-setup"></a>
## 手順どおりにセットアップ

<a id="1-clone-the-repository"></a>
### 1. リポジトリをクローン

まずはコードを取得します：

```bash
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

<a id="2-backend-setup"></a>
### 2. バックエンドのセットアップ

バックエンドは Python（FastAPI）で、AI 処理、履歴書の解析、データ保存を担当します。

#### バックエンドディレクトリへ移動

```bash
cd apps/backend
```

#### 環境ファイルを作成

```bash
cp .env.example .env
```

#### `.env` を好みのエディタで編集

```bash
# macOS/Linux
nano .env

# 好みのエディタでも OK
code .env   # VS Code
```

最重要設定は AI プロバイダです。OpenAI の最小例：

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-nano-2025-08-07
LLM_API_KEY=sk-your-api-key-here

# ローカル開発では既定のままで OK
HOST=0.0.0.0
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### Python 依存関係をインストール

```bash
uv sync
```

仮想環境を作成し、必要なパッケージをインストールします。

#### バックエンドサーバを起動

```bash
RELOAD=true uv run app
```

次のような出力が表示されます：

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**このターミナルは起動したまま**、フロントエンド用に別ターミナルを開きます。

<a id="3-frontend-setup"></a>
### 3. フロントエンドのセットアップ

フロントエンドは Next.js で、UI を提供します。

#### フロントエンドディレクトリへ移動

```bash
cd apps/frontend
```

#### （任意）フロントエンドの環境ファイルを作成

バックエンドを別ポートで動かす場合のみ必要です：

```bash
cp .env.sample .env.local
```

#### Node.js 依存関係をインストール

```bash
npm install
```

#### 開発サーバを起動

```bash
npm run dev
```

次のように表示されます：

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

ブラウザで **<http://localhost:3000>** を開くと、Resume Matcher のダッシュボードが表示されます。

---

<a id="configuring-your-ai-provider"></a>
## AI プロバイダの設定

Resume Matcher は複数の AI プロバイダに対応しています。アプリ内の Settings ページ、またはバックエンドの `.env` を編集して設定できます。

<a id="option-a-cloud-providers"></a>
### オプション A: クラウドプロバイダ

| プロバイダ | 設定 | API キー取得先 |
|----------|------|----------------|
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-5-nano-2025-08-07` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **OpenAI-Compatible** | `LLM_PROVIDER=openai_compatible`<br>`LLM_MODEL=llama-3.1-8b`<br>`LLM_API_BASE=http://localhost:8080/v1` | — (ローカル) |

**OpenAI-Compatible** は OpenAI Chat Completions API を公開する任意のローカルサーバー（llama.cpp、vLLM、LM Studio など）を対象とします。API キーは任意です。

Anthropic の `.env` 例：

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>
### オプション B: Ollama によるローカル AI（無料）

API コストなしでローカル実行したい場合は Ollama を使えます。

#### ステップ 1: Ollama をインストール

[ollama.com](https://ollama.com) からダウンロードしてインストールします。

#### ステップ 2: モデルを取得

```bash
ollama pull gemma3:4b
```

他の候補：`mistral`、`codellama`、`neural-chat`

#### ステップ 3: `.env` を設定

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# Ollama では LLM_API_KEY は不要です
```

#### ステップ 4: Ollama が起動していることを確認

```bash
ollama serve
```

通常はインストール後に自動起動します。

<a id="option-c-your-chatgpt-plan-sign-in-with-chatgpt"></a>
### オプション C: ChatGPT プラン（Sign in with ChatGPT）

OpenAI 公式の [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source)（プレビュー版のため変更される可能性があります）を利用する、コミュニティが開発したプロバイダです。ChatGPT Plus と Pro で使え、API キーは不要で、リクエストはお使いのマシンから OpenAI の Responses API に直接送信されます。利用量は ChatGPT プランの上限に含まれます。Plus では 5 時間の上限を、プランを使う他のアプリと共有します。Pro には 5 時間の上限はありません。確実に利用するには、代わりに OpenAI の API キーを使用してください。

1. バックエンドとフロントエンドを起動し、**バックエンドと同じマシン上の**ブラウザで **Settings** を開きます。
2. **ChatGPT plan** を選び、**Continue with ChatGPT** をクリックします。
3. OpenAI でサインインし、Resume Matcher が ChatGPT プランを使うことを許可します。初回は OpenAI がアカウントにアプリを登録し、以降のサインインではその登録が再利用されます。
4. Settings に戻ります。アカウントで利用できるモデルを選び、**Save** をクリックします。

OpenAI はブラウザを `http://127.0.0.1:<backend port>/auth/callback`（既定ではポート `8000`）に戻し、バックエンドはこのコールバックを `127.0.0.1` からのみ受け付けます。そのため、ブラウザはバックエンドを実行しているマシン上で動作し、そのポートに直接到達できる必要があります。トークンは暗号化してバックエンドのデータディレクトリ（`chatgpt_credentials.enc`）に保存されます。**Disconnect** は OpenAI 側でセッションを取り消してトークンを削除し、**Manage usage** は ChatGPT の使用状況設定を開きます。

**Docker:** 既定の構成で公開されるのはポート 3000 のみです。Docker の公開ポート経由の接続は `127.0.0.1` ではなく Docker のゲートウェイからコンテナに届くため、サインインを完了できません。Linux ではホストネットワーク（`network_mode: host`）でコンテナを実行してください。それ以外の場合は、このプロバイダを使うために Resume Matcher を（Docker ではなく）ローカルで実行してください。

同等の `.env`（サインインは引き続き Settings から行います）：

```env
LLM_PROVIDER=chatgpt
LLM_MODEL=gpt-6.1-sol  # Settings のアカウントのモデル一覧にあるモデルに置き換えてください
```

---

<a id="docker-deployment"></a>
## Docker デプロイ

コンテナで動かしたい場合、Resume Matcher は Docker に対応しています。

### Docker Compose を使う（推奨）

```bash
# コンテナをビルドして起動
docker-compose up -d

# ログを見る
docker-compose logs -f

# コンテナ停止
docker-compose down
```

<a id="optional-postgresql"></a>
### オプション: PostgreSQL

SQLite が既定で、セットアップは不要です。バックアップが必要な場合や、自分で管理する別のサーバーにデータベースを置きたい場合は、代わりに PostgreSQL を使えます。

> **セキュリティ:** Resume Matcher にはユーザーアカウントも認証もなく、PostgreSQL を使ってもそれらは追加されません。自分だけで使うか、信頼できるプライベートネットワーク内でのみ実行し、インターネットなどに公開しないでください。ローカル以外の用途では、最小権限のデータベースロールで接続してください（Compose ファイルの `resume` ユーザーはスーパーユーザーです）。

Docker Compose で起動するには：

```bash
POSTGRES_PASSWORD=change-me docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

`POSTGRES_PASSWORD` はそのまま `DATABASE_URL` にコピーされるため、URL で安全に使えるパスワード（英字、数字、`-._~`）にしてください。

Docker を使わない場合は、`apps/backend/.env` に `DATABASE_URL=postgresql://user:password@host:5432/dbname`（必要に応じて `DATABASE_SCHEMA` も）を設定し、パスワード中の特殊文字はパーセントエンコードします。リモートデータベースの場合は URL に `?sslmode=require` を付けます。テーブルは起動時に作成されます。

ローカルインストールの既存データを移行するには、`DATABASE_URL` を設定した状態で `apps/backend` から `uv run python -m app.scripts.copy_sqlite_to_postgres` を実行します。既定の `--source` は `apps/backend/data/resume_matcher.db` で、これはローカルインストールにのみ存在します。別の SQLite ファイルを使う場合は `--source <file>` を指定してください。空でないデータベースには書き込みません。先にアプリを停止してください。コピー開始後に行われた書き込みはコピーされません。

Docker インストールでは SQLite データベースはホストではなく `resume-data` ボリューム内にあります。アプリを停止してから、そのボリュームが既定のソースとなるコンテナ内でスクリプトを実行します：

```bash
export POSTGRES_PASSWORD=change-me
docker compose stop
docker compose -f docker-compose.yml -f docker-compose.postgres.yml run --rm -w /app/backend resume-matcher python -m app.scripts.copy_sqlite_to_postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

別の方法として、停止したコンテナからファイルをコピーし（`docker cp resume-matcher:/app/backend/data/resume_matcher.db .`）、データベースに到達できるホストから `--source ./resume_matcher.db` で指定します。`data/.secret_key`（ボリューム内に残ります）は必ず保持してください。保存済みの API キーの復号に使われます。

### Docker の注意点

- **API キーは UI から設定**：<http://localhost:3000/settings>（`.env` ではありません）
- データは Docker volume に永続化されます
- フロントエンド（3000）とバックエンド（8000）のポートが公開されます

<!-- 注：Docker ドキュメントは準備中です。現在は docker-compose.yml を参照してください -->

---

<a id="accessing-the-application"></a>
## アプリへのアクセス

両方のサーバが起動したら、ブラウザで以下にアクセスします：

| URL | 内容 |
|-----|------|
| **<http://localhost:3000>** | メインアプリ（Dashboard） |
| **<http://localhost:3000/settings>** | AI プロバイダ設定 |
| **<http://localhost:8000>** | バックエンド API ルート |
| **<http://localhost:8000/docs>** | 対話型 API ドキュメント |
| **<http://localhost:8000/health>** | バックエンドヘルスチェック |

### 初回セットアップチェックリスト

1. <http://localhost:3000/settings> を開く
2. AI プロバイダを選択
3. API キーを入力（または Ollama を設定）
4. "Save Configuration" をクリック
5. "Test Connection" をクリックして確認
6. Dashboard に戻り、最初の履歴書をアップロード

---

<a id="use-resume-matcher-from-claude-code-or-claude-desktop-mcp"></a>
## Claude Code / Claude Desktop から Resume Matcher を使う（MCP）

Resume Matcher には [MCP](https://modelcontextprotocol.io) サーバが付属しており、Claude Code、Claude Desktop、Cursor、Codex から直接操作できます。stdio で動作し、**LLM の API キーは不要**です。コンテンツは Claude が書き、Resume Matcher が保存・検証・採点・レンダリングを行います。Web アプリとデータベースを共有するため、Claude が保存した内容は UI にも表示されます。

**前提:** ローカル（Docker 以外）のインストールが必要です。リポジトリをクローンして `cd apps/backend && uv sync` を実行してください（[バックエンドのセットアップ](#2-backend-setup) を参照）。

### Claude Code

```bash
claude mcp add resume-matcher -- uv run --directory /abs/path/to/Resume-Matcher/apps/backend resume-matcher-mcp
```

### Claude Desktop

`claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`、Windows: `%APPDATA%\Claude\claude_desktop_config.json`）に次を追加し、Claude Desktop を再起動します：

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

`command` には `uv` の**絶対パス**を指定してください（macOS/Linux では `which uv`、Windows では `where uv` で確認できます）。Claude Desktop はシェルの `PATH` を継承しないため、`uv` だけでは見つかりません。Windows では、JSON 内のパスのバックスラッシュを二重にしてください。

### その他の MCP クライアント

Cursor、Codex などのクライアントも同じコマンド（`uv`）と引数（`run --directory <path>/apps/backend resume-matcher-mcp`）を使います。

### 補足

- **同じチェックアウト、同じデータ。** 両方が同じデータベースを使うよう、Web アプリも同じチェックアウトから実行してください。`DATA_DIR` で SQLite ファイルの場所を変更できます。`DATABASE_URL` を設定すると、代わりに [PostgreSQL](#optional-postgresql) を使います。
- **PDF と verify にはフロントエンドが必要。** PDF エクスポート、`verify_resume`、`tailor_and_verify`、`parse_check_resume` には、フロントエンドが起動している必要があります（既定は <http://localhost:3000>、`FRONTEND_BASE_URL` で変更できます）。その他のツールはフロントエンドなしで動作します。
- **Docker にはまだ対応していません。** アプリのデータベースは Docker ボリューム内にあるため、ホスト上で起動したサーバからは空のデータベースに見えます。

サーバーには、履歴書と求人票の一覧・取得、マスター履歴書の作成、求人票の登録、履歴書の調整と検証（`tailor_and_verify`）、ATS 向けのパースチェックとスコア算出、PDF の書き出し（`export_resume_pdf`）、応募状況の管理を行うツールが用意されています。接続するとクライアントにツール一覧が表示され、サーバー組み込みの指示が Claude に作業の流れを案内します。

---

<a id="common-commands-reference"></a>
## よく使うコマンド

### バックエンド

```bash
cd apps/backend

# 開発サーバ（自動リロード）
RELOAD=true uv run app

# 本番サーバ
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 依存関係のインストール
uv sync

# 開発用依存関係も含める（テスト用）
uv sync --group dev

# テスト実行
uv run pytest

# DB の状態確認（JSON ファイル）
ls -la data/
```

### フロントエンド

```bash
cd apps/frontend

# 開発サーバ（Turbopack）
npm run dev

# 本番ビルド
npm run build

# 本番起動
npm run start

# Lint
npm run lint

# Prettier で整形
npm run format

# 別ポートで起動
npm run dev -- -p 3001
```

### データベース管理

Resume Matcher は TinyDB（JSON ファイル保存）を使用します。データは `apps/backend/data/` にあります：

```bash
# DB ファイルを見る
ls apps/backend/data/

# バックアップ
cp -r apps/backend/data apps/backend/data-backup

# 全リセット（初期化）
rm -rf apps/backend/data
```

---

<a id="troubleshooting"></a>
## トラブルシューティング

### バックエンドが起動しない

**Error:** `ModuleNotFoundError`

`uv` で起動していることを確認してください：

```bash
uv run uvicorn app.main:app --reload
```

**Error:** `LLM_API_KEY not configured`

`.env` に選択したプロバイダ用の API キーが設定されているか確認してください。

### フロントエンドが起動しない

**Error:** ページ読み込み時に `ECONNREFUSED`

バックエンドが起動していません。先に起動してください：

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**Error:** build または TypeScript エラー

Next.js のキャッシュを削除します：

```bash
rm -rf apps/frontend/.next
npm run dev
```

### PDF のダウンロードに失敗する

**Error:** `Cannot connect to frontend for PDF generation`

バックエンドからフロントエンドへ接続できません。以下を確認してください：

1. フロントエンドが起動している
2. `.env` の `FRONTEND_BASE_URL` がフロントエンド URL と一致している
3. `CORS_ORIGINS` にフロントエンド URL が含まれている

フロントエンドが 3001 の場合：

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Ollama の接続に失敗する

**Error:** `Connection refused to localhost:11434`

1. Ollama の稼働確認：`ollama list`
2. 必要なら起動：`ollama serve`
3. モデルが取得済みか確認：`ollama pull gemma3:4b`

---

<a id="project-structure-overview"></a>
## プロジェクト構成

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
## ヘルプ

困ったときは次を参照してください：

- **Discord:** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - 質問・議論に活発です
- **GitHub Issues:** [Issue を作成](https://github.com/srbhr/Resume-Matcher/issues)（バグ報告や要望）
- **ドキュメント:** 詳細は[オンラインドキュメント](https://resumematcher.fyi/docs/)を参照

---

楽しい履歴書づくりを！Resume Matcher が役立ったら、[リポジトリに Star](https://github.com/srbhr/Resume-Matcher) と [Discord 参加](https://dsc.gg/resume-matcher) をぜひ。

