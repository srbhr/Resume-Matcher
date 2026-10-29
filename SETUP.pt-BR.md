# Guia de Instalação do Resume Matcher

[English](SETUP.md) | [Español](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md) | [**Português (BR)**](SETUP.pt-BR.md)

Bem-vindo! Este guia vai levar você pela instalação do Resume Matcher na sua máquina local. Seja você uma pessoa desenvolvedora que quer contribuir ou alguém que só quer rodar a aplicação localmente, este guia cobre tudo.

---

## Índice

- [Pré-requisitos](#prerequisites)
- [Início rápido](#quick-start)
- [Instalação no Windows 11](#windows-11-setup)
- [Instalação passo a passo](#step-by-step-setup)
  - [1. Clonar o repositório](#1-clone-the-repository)
  - [2. Configuração do backend](#2-backend-setup)
  - [3. Configuração do frontend](#3-frontend-setup)
- [Configurar seu provedor de IA](#configuring-your-ai-provider)
  - [Opção A: provedores em nuvem](#option-a-cloud-providers)
  - [Opção B: IA local com Ollama (grátis)](#option-b-local-ai-with-ollama-free)
  - [Opção C: seu plano do ChatGPT (Sign in with ChatGPT)](#option-c-your-chatgpt-plan-sign-in-with-chatgpt)
- [Deploy com Docker](#docker-deployment)
- [Acessar a aplicação](#accessing-the-application)
- [Usar o Resume Matcher com um agente de código](#use-resume-matcher-with-a-coding-agent)
- [Usar o Resume Matcher pelo Claude Code ou Claude Desktop (MCP)](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp)
- [Referência de comandos comuns](#common-commands-reference)
- [Solução de problemas](#troubleshooting)
- [Visão geral da estrutura do projeto](#project-structure-overview)
- [Obter ajuda](#getting-help)

---

<a id="prerequisites"></a>

## Pré-requisitos

Antes de começar, confira se você tem o seguinte instalado no seu sistema:

| Ferramenta | Versão mínima | Como verificar | Instalação |
|------------|---------------|----------------|------------|
| **Python** | 3.13+ | `python --version` | [python.org](https://python.org) |
| **Node.js** | 24.22.1 (fixada em `.nvmrc`; `nvm use`) | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | 10+ | `npm --version` | Vem com o Node.js |
| **uv** | Mais recente | `uv --version` | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git** | Qualquer | `git --version` | [git-scm.com](https://git-scm.com) |

### Instalar o uv (gerenciador de pacotes Python)

O Resume Matcher usa o `uv` para gerenciar dependências Python de forma rápida e confiável. Instale com:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Ou via pip
pip install uv
```

---

<a id="quick-start"></a>

## Início rápido

Se você já está familiarizado com ferramentas de desenvolvimento e quer rodar rapidamente:

```bash
# 1. Clone o repositório
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 2. Inicie o backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Cria a configuração a partir do modelo
uv sync                      # Instala as dependências Python
uv run app

# 3. Inicie o frontend (Terminal 2)
cd apps/frontend
npm install                  # Instala as dependências Node.js
npm run dev                  # Inicia o servidor de desenvolvimento
```

Abra o navegador em **<http://localhost:3000>** e pronto!

> **Observação:** você precisará configurar um provedor de IA antes de usar o app. Veja [Configurar seu provedor de IA](#configuring-your-ai-provider) abaixo.

---

<a id="windows-11-setup"></a>

## Instalação no Windows 11

Os comandos acima e no restante deste guia usam a sintaxe de shell do macOS/Linux. No Windows 11, use os comandos do **PowerShell** (ou do Windows Terminal) desta seção.

### 1. Instalar os pré-requisitos

Instale as ferramentas de [Pré-requisitos](#prerequisites) com o `winget` (já incluído no Windows 11) e depois **feche e reabra o PowerShell** para que elas entrem no seu `PATH`:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
```

Você também pode usar os instaladores dos links da tabela de [Pré-requisitos](#prerequisites).

### 2. Baixar o código

Clone com o Git:

```powershell
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

Ou, sem o Git, abra a [página do repositório](https://github.com/srbhr/Resume-Matcher), clique em **Code → Download ZIP**, extraia o ZIP e use `cd` para entrar na pasta extraída no PowerShell.

### 3. Iniciar o backend (janela 1 do PowerShell)

```powershell
cd apps\backend
Copy-Item .env.example .env   # Cria a configuração a partir do modelo
notepad .env                  # Edita a configuração (veja abaixo)
uv sync                       # Instala as dependências Python
uv run app
```

Mantenha `HOST=127.0.0.1` no `.env` para que o backend fique acessível apenas a partir da sua própria máquina: a API não tem autenticação. Se quiser, defina seu provedor de IA aqui e use `RELOAD=true` para recarregar automaticamente quando o código mudar.

### 4. Iniciar o frontend (janela 2 do PowerShell)

Uma nova janela do PowerShell abre na sua pasta pessoal, então primeiro vá até a pasta onde você clonou ou extraiu o Resume Matcher (troque o caminho pelo seu):

```powershell
cd C:\path\to\Resume-Matcher
cd apps\frontend
npm install
npm run dev
```

Abra **<http://localhost:3000>** no navegador.

> **Exportação de PDF:** o Resume Matcher gera PDFs com o Chromium headless. Se o navegador do Playwright não estiver instalado, o backend usa como alternativa o Microsoft Edge ou o Google Chrome instalado (o Edge já vem no Windows 11). Você também pode instalar o Chromium do Playwright a partir de `apps\backend` com `uv run playwright install chromium`.

> **Prefere Docker?** Instale o [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) e siga [Deploy com Docker](#docker-deployment). Para definir variáveis como `PORT` no PowerShell, use `$env:PORT="4000"; docker compose up -d`. Para a [configuração opcional do PostgreSQL](#optional-postgresql), rode `$env:POSTGRES_PASSWORD=[guid]::NewGuid().ToString('N'); docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`; fora do Docker, defina `DATABASE_URL` em `apps\backend\.env`.

---

<a id="step-by-step-setup"></a>

## Instalação passo a passo

<a id="1-clone-the-repository"></a>

### 1. Clonar o repositório

Primeiro, coloque o código na sua máquina:

```bash
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

<a id="2-backend-setup"></a>

### 2. Configuração do backend

O backend é uma aplicação Python com FastAPI que cuida do processamento de IA, da leitura de currículos e do armazenamento de dados.

#### Acesse o diretório do backend

```bash
cd apps/backend
```

#### Crie seu arquivo de ambiente

```bash
cp .env.example .env
```

#### Edite o arquivo `.env` com o editor de texto de sua preferência

```bash
# macOS/Linux
nano .env

# Ou use qualquer editor que preferir
code .env   # VS Code
```

A configuração mais importante é o seu provedor de IA. Veja uma configuração mínima para a OpenAI:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-nano-2025-08-07
LLM_API_KEY=sk-your-api-key-here

# Mantenha estes valores padrão para desenvolvimento local
HOST=127.0.0.1
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### Instale as dependências Python

```bash
uv sync
```

Isso cria um ambiente virtual e instala todos os pacotes necessários.

#### Inicie o servidor do backend

```bash
RELOAD=true uv run app
```

Você deve ver uma saída como esta:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**Deixe este terminal rodando** e abra um novo terminal para o frontend.

<a id="3-frontend-setup"></a>

### 3. Configuração do frontend

O frontend é uma aplicação Next.js que fornece a interface do usuário.

#### Acesse o diretório do frontend

```bash
cd apps/frontend
```

#### (Opcional) Crie um arquivo de ambiente do frontend

Isso só é necessário se o seu backend rodar em outra porta:

```bash
cp .env.sample .env.local
```

#### Instale as dependências Node.js

```bash
npm install
```

#### Inicie o servidor de desenvolvimento

```bash
npm run dev
```

Você deve ver:

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

Abra **<http://localhost:3000>** no navegador. Você deve ver o painel do Resume Matcher!

---

<a id="configuring-your-ai-provider"></a>

## Configurar seu provedor de IA

O Resume Matcher é compatível com vários provedores de IA. Você pode configurar o seu provedor pela página Configurações (Settings) do app ou editando o arquivo `.env` do backend.

<a id="option-a-cloud-providers"></a>

### Opção A: provedores em nuvem

| Provedor | Configuração | Obter chave de API |
|----------|--------------|---------------|
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-5-nano-2025-08-07` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Azure AI Foundry** | `LLM_PROVIDER=azure_foundry`<br>`LLM_MODEL=mistral-large-latest`<br>`LLM_API_BASE=https://<resource>.services.ai.azure.com/models`<br>Para deployments GPT do Azure OpenAI hospedados no Foundry, use a raiz do serviço ou o endpoint completo `/openai/v1/responses` do Foundry. | Endpoint/chave do Azure AI Foundry |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini/gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **OpenAI-Compatible** | `LLM_PROVIDER=openai_compatible`<br>`LLM_MODEL=llama-3.1-8b`<br>`LLM_API_BASE=http://localhost:8080/v1` | - (local) |

**OpenAI-Compatible** serve para qualquer servidor local que exponha a API Chat Completions da OpenAI: llama.cpp, vLLM, LM Studio etc. A chave de API é opcional.

Exemplo de `.env` para a Anthropic:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>

### Opção B: IA local com Ollama (grátis)

Quer rodar modelos de IA localmente, sem custo de API? Use o Ollama!

#### Passo 1: instale o Ollama

Baixe e instale em [ollama.com](https://ollama.com)

#### Passo 2: baixe um modelo

```bash
ollama pull gemma3:4b
```

Outras boas opções: `llama3.2`, `mistral`, `codellama`, `neural-chat`

#### Passo 3: configure o seu `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY não é necessária para o Ollama
```

#### Passo 4: confirme que o Ollama está rodando

```bash
ollama serve
```

Normalmente o Ollama inicia sozinho depois da instalação.

<a id="option-c-your-chatgpt-plan-sign-in-with-chatgpt"></a>

### Opção C: seu plano do ChatGPT (Sign in with ChatGPT)

Um provedor criado pela comunidade que usa o [Sign in with ChatGPT para apps de código aberto](https://developers.openai.com/siwc/token-sharing-open-source) oficial da OpenAI (um preview, então pode mudar). Funciona com o ChatGPT Plus e Pro, não exige chave de API e envia as requisições da sua máquina direto para a Responses API da OpenAI. O uso conta nos limites do seu plano do ChatGPT: no Plus, o limite de cinco horas é compartilhado com os outros apps que usam o seu plano; o Pro não tem limite de cinco horas. Para ter acesso garantido, use uma chave de API da OpenAI.

1. Inicie o backend e o frontend e abra **Configurações** (Settings) em um navegador **na mesma máquina do backend**.
2. Escolha **Plano ChatGPT** (ChatGPT plan) e clique em **Continuar com o ChatGPT** (Continue with ChatGPT).
3. Entre na sua conta na OpenAI e autorize o Resume Matcher a usar o seu plano do ChatGPT. Na primeira vez, a OpenAI registra o app na sua conta; as próximas entradas reaproveitam esse registro.
4. Você volta para Configurações. Escolha um dos modelos da sua conta e clique em **Salvar** (Save).

A OpenAI redireciona o navegador para `http://127.0.0.1:<port>/auth/callback`, em que `<port>` é a porta em que você abriu o Resume Matcher (`3000` por padrão). O frontend encaminha esse caminho para o backend, e o backend só aceita o callback vindo da própria máquina em que roda. Por isso, o navegador precisa rodar na máquina que executa o Resume Matcher, e você deve abri-lo como `http://localhost:<port>` ou `http://127.0.0.1:<port>`. Os tokens ficam armazenados criptografados no diretório de dados do backend (`chatgpt_credentials.enc`). **Desconectar** (Disconnect) revoga a sessão na OpenAI e apaga os tokens; **Gerenciar uso** (Manage usage) abre as configurações de uso do seu ChatGPT.

**Docker:** o login funciona com a configuração padrão, que publica apenas a porta 3000: abra o Resume Matcher em `http://localhost:3000` (ou na `PORT` que você publicou) na máquina que executa o contêiner. A OpenAI devolve o navegador para essa mesma porta, e o frontend encaminha `/auth/callback` para o backend dentro do contêiner. Não funciona a partir de outro computador nem por um domínio de reverse proxy, porque a OpenAI só permite redirecionamentos para `http://127.0.0.1`.

O `.env` equivalente (você ainda faz o login em Configurações):

```env
LLM_PROVIDER=chatgpt
LLM_MODEL=gpt-6.1-sol  # troque por um modelo da lista da sua conta em Configurações
```

---

<a id="docker-deployment"></a>

## Deploy com Docker

Prefere um deploy em contêiner? O Resume Matcher inclui suporte a Docker.

### Início rápido com Docker Compose

```bash
# Inicia o contêiner a partir de uma imagem publicada
docker compose up -d

# Exibe os logs
docker compose logs -f

# Para o contêiner
docker compose down
```

### Personalizar portas

```bash
# Muda só a porta do host (o contêiner continua na 3000)
PORT=4000 docker compose up -d
```

### Opções de configuração

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do host mapeada para a porta `3000` do contêiner |
| `BIND_ADDRESS` | `127.0.0.1` | Endereço do host em que a porta é publicada. `127.0.0.1` = apenas esta máquina; `0.0.0.0` = todas as interfaces de rede (veja abaixo) |
| `ALLOWED_HOSTS` | - | Nomes de host extras para os quais o app responde, separados por vírgula (ex.: `192.168.1.20`); `*` permite qualquer um |
| `FRONTEND_BASE_URL` | `http://localhost:3000` | A URL em que você abre o app; o nome de host dela é permitido automaticamente |
| `LOG_LEVEL` | `INFO` | Nível de log do Python/Uvicorn em toda a aplicação (`ERROR`, `WARNING`, `INFO`, `DEBUG`) |
| `LOG_LLM` | `WARNING` | Nível de log do LiteLLM (`ERROR`, `WARNING`, `INFO`, `DEBUG`) |
| `LLM_PROVIDER` | `openai` | Provedor de IA (openai, anthropic, gemini etc.) |
| `LLM_MODEL` | - | Modelo a ser usado (configurado pela interface de Configurações) |
| `LLM_API_KEY` | - | Chave de API (recomendado: configurar pela interface de Configurações) |
| `LLM_API_BASE` | - | Endpoint de API personalizado (para Ollama ou proxies) |

> **Observação:** mudanças em `LOG_LEVEL` e `LOG_LLM` exigem reiniciar o contêiner para valer.

<a id="opening-it-from-another-device"></a>

### Abrir de outro dispositivo

O contêiner é publicado apenas em `127.0.0.1`, então ele abre na máquina que roda o Docker e em nenhum outro lugar. O Resume Matcher não tem login: qualquer pessoa que consiga acessá-lo pode ler seus currículos e alterar suas configurações de IA. Para usá-lo de um celular ou de outro computador em uma rede em que você confia, publique em todas as interfaces e permita o endereço que você vai digitar:

```bash
BIND_ADDRESS=0.0.0.0 ALLOWED_HOSTS=192.168.1.20 docker compose up -d
```

Requisições para qualquer outro nome de host recebem `400 Invalid host header`. Atrás de um reverse proxy com domínio próprio, defina `FRONTEND_BASE_URL` com essa URL; o nome de host dela é permitido automaticamente.

<a id="using-ollama-with-docker"></a>

### Usar o Ollama com Docker

Dentro do contêiner, `localhost` é o próprio contêiner, não o seu computador, então a URL padrão do Ollama, `http://localhost:11434`, não funciona ali. Use `host.docker.internal`, que o arquivo Compose aponta para o seu computador (inclusive no Linux, por meio de `extra_hosts`):

1. Em **Configurações** (Settings), escolha **Ollama** e defina **URL Base** (Base URL) como `http://host.docker.internal:11434`; depois clique em **Testar Conexão** (Test Connection). Ou defina na inicialização:

   ```bash
   LLM_PROVIDER=ollama LLM_MODEL=gemma3:4b LLM_API_BASE=http://host.docker.internal:11434 docker compose up -d
   ```

2. **Somente no Linux:** o Ollama escuta em `127.0.0.1` por padrão, e o tráfego vindo de um contêiner não chega lá. Faça-o escutar também na bridge do Docker e reinicie-o:

   ```bash
   sudo systemctl edit ollama   # adicione as duas linhas abaixo
   # [Service]
   # Environment="OLLAMA_HOST=0.0.0.0"
   sudo systemctl restart ollama
   ```

   `0.0.0.0` também expõe o Ollama para a sua rede; bloqueie a porta `11434` no firewall se isso for um problema para você. O Docker Desktop no macOS e no Windows não precisa de nenhuma mudança.

Se o **Testar Conexão** (Test Connection) disser *localhost is the container itself*, a URL Base ainda aponta para `localhost` ou `127.0.0.1`. O mesmo vale para LM Studio, llama.cpp e outros servidores no seu computador: use `host.docker.internal` com a porta deles.

### Usar Docker Secrets

O contêiner aceita `*_FILE` a partir dos
[docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/#use-secrets).
Para valores sensíveis, você pode montar um arquivo de secret e apontar para ele:

```bash
LLM_API_KEY_FILE=/run/secrets/llm_api_key docker compose up -d
```

Variáveis `*_FILE` compatíveis:

| Variável | Variante `*_FILE` |
|----------|-------------------|
| `LOG_LEVEL` | `LOG_LEVEL_FILE` |
| `LOG_LLM` | `LOG_LLM_FILE` |
| `LLM_PROVIDER` | `LLM_PROVIDER_FILE` |
| `LLM_MODEL` | `LLM_MODEL_FILE` |
| `LLM_API_KEY` | `LLM_API_KEY_FILE` |
| `LLM_API_BASE` | `LLM_API_BASE_FILE` |

Regras:

- Use a variável ou a variante `*_FILE`, não as duas.
- Se as duas estiverem definidas, o contêiner encerra com um erro explícito.

### Configuração do nível de log

Você pode ajustar os logs globalmente e, separadamente, os do LiteLLM:

```bash
LOG_LEVEL=INFO LOG_LLM=DEBUG docker compose up -d
```

> **Alerta de segurança:** `LOG_LLM=DEBUG` faz o LiteLLM registrar chaves de API
> em texto puro. Não use o nível `DEBUG` em produção nem em ambientes compartilhados.
> O padrão `WARNING` é seguro.

> **Observação:** o LiteLLM também lê internamente a variável de ambiente `LITELLM_LOG`
> para controlar a filtragem no nível do handler. `LOG_LLM` define o nível do *logger*. Os dois precisam
> permitir uma mensagem para que ela apareça. Se você definir `LITELLM_LOG` a partir da documentação do LiteLLM,
> garanta que `LOG_LLM` esteja em um nível igual ou mais baixo.

<a id="optional-postgresql"></a>

### Opcional: PostgreSQL

O SQLite é o padrão e não exige configuração. Para ter backups, ou para manter o banco em um servidor separado que você controla, você pode usar o PostgreSQL.

> **Segurança:** o Resume Matcher não tem contas de usuário nem autenticação, e o PostgreSQL não adiciona nenhuma. Rode-o apenas para você mesmo ou em uma rede privada confiável, nunca exposto publicamente. Para qualquer uso além do local, conecte com um role de banco de menor privilégio (o usuário `resume` do arquivo Compose é superusuário).

Para iniciá-lo com Docker Compose:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

`POSTGRES_PASSWORD` é copiada para `DATABASE_URL` como está, então use uma senha que possa ir numa URL sem escape (só letras, dígitos e `-._~`); `openssl rand -hex 32` gera uma. Não use um valor fácil de adivinhar. Guarde a senha: o PostgreSQL a armazena no volume `postgres-data` na primeira inicialização, e todo comando `docker compose` seguinte precisa do mesmo valor (exporte-a de novo ou coloque `POSTGRES_PASSWORD=...` em um arquivo `.env` ao lado de `docker-compose.yml`).

Fora do Docker, defina `DATABASE_URL=postgresql://user:password@host:5432/dbname` (e, opcionalmente, `DATABASE_SCHEMA`) em `apps/backend/.env`, aplicando percent-encoding a quaisquer caracteres especiais da senha. Para um banco remoto, adicione `?sslmode=require` à URL. As tabelas são criadas na inicialização.

Para mover os dados existentes de uma instalação local, rode `uv run python -m app.scripts.copy_sqlite_to_postgres` a partir de `apps/backend` com `DATABASE_URL` definida. O `--source` padrão é `apps/backend/data/resume_matcher.db`, que só existe em instalações locais; passe `--source <file>` para outro arquivo SQLite. O script se recusa a escrever em um banco que não esteja vazio. Pare o app antes: escritas feitas depois que a cópia começa não são copiadas.

Uma instalação Docker mantém o banco SQLite no volume `resume-data`, não no host. Pare o app e rode o script dentro do contêiner, em que esse volume é a origem padrão (com a mesma `POSTGRES_PASSWORD` definida acima):

```bash
docker compose stop
docker compose -f docker-compose.yml -f docker-compose.postgres.yml run --rm -w /app/backend resume-matcher python -m app.scripts.copy_sqlite_to_postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Como alternativa, copie o arquivo para fora do contêiner parado (`docker cp resume-matcher:/app/backend/data/resume_matcher.db .`) e passe-o com `--source ./resume_matcher.db` a partir de um host que alcance o banco. Mantenha `data/.secret_key` (ele continua no volume): é ele que descriptografa as suas chaves de API armazenadas.

### Testar a imagem Docker

Para verificar se a imagem é gerada e funciona (backend e frontend iniciam, as páginas carregam, a exportação de PDF renderiza), rode o smoke test a partir da raiz do repositório:

```bash
./scripts/docker-smoke.sh
```

Ele gera a imagem usando o cache de build, inicia na porta `3100` (defina `SMOKE_PORT` para mudar) com um volume de dados descartável, roda as verificações, imprime `PASS` ou `FAIL` com o tamanho da imagem e remove o contêiner e o volume. Nunca toca nos seus dados reais e não faz chamadas a LLMs. Flags: `--no-build` (testa uma imagem existente), `--tag <name>`, `--keep` (deixa rodando para você inspecionar), `--clean` (remove também a imagem).

Para iterar rápido, use o Compose watch (Docker Compose 2.22 ou mais recente):

```bash
docker compose watch
```

As edições em `apps/backend/app` são sincronizadas com o contêiner em execução, que reinicia sem rebuild da imagem. Mudanças em `apps/frontend`, `apps/backend/pyproject.toml`, no `Dockerfile` ou em `docker/` reconstroem a imagem. As dependências Python e o Chromium ficam em camadas próprias no cache, então um rebuild depois de uma mudança de código não baixa tudo de novo.

Se alguma etapa do build baixar devagar, aponte-a para um mirror. Os quatro build args são vazios por padrão (sem alteração):

- `DEBIAN_MIRROR`: se o `apt-get` estiver lento, gere com `DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian` (ou o seu mirror local; informe a URL `/debian` dele). As atualizações de segurança continuam em `deb.debian.org`, a menos que você defina também `DEBIAN_SECURITY_MIRROR` (uma URL `/debian-security`; a maioria dos mirrors não a oferece).
- `PIP_INDEX_URL`: se o download dos pacotes Python estiver lento, defina-a com a URL `/simple` de um mirror do PyPI (por exemplo `https://pypi.mirrors.ustc.edu.cn/simple`).
- `PLAYWRIGHT_DOWNLOAD_HOST`: se o download do Chromium estiver lento (a CDN padrão do Playwright pode sofrer limitação em algumas regiões), defina-a com a URL do seu mirror.

```bash
docker build \
  --build-arg DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian \
  --build-arg PIP_INDEX_URL=https://pypi.mirrors.ustc.edu.cn/simple \
  --build-arg PLAYWRIGHT_DOWNLOAD_HOST=https://your-mirror.example.com \
  -t resume-matcher .
```

`docker compose build` e `scripts/docker-smoke.sh` leem os quatro a partir de variáveis de ambiente de mesmo nome, por exemplo `DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian ./scripts/docker-smoke.sh`.

### Observações importantes

- **As chaves de API são mais bem configuradas pela interface** em `http://localhost:3000/settings`
- Os dados são persistidos em um volume Docker (`resume-data`)
- A configuração feita na interface de Configurações fica armazenada no volume e persiste entre reinicializações
- O app e a API compartilham a mesma origem: frontend em `/`, API em `/api`



<a id="accessing-the-application"></a>

## Acessar a aplicação

Com o contêiner rodando, abra o navegador:

| URL | Descrição |
|-----|-----------|
| **<http://localhost:3000>** | Aplicação principal (Painel) |
| **<http://localhost:3000/settings>** | Configurar o provedor de IA |
| **<http://localhost:3000/api/v1/health>** | Verificação de saúde (health check) do backend |
| **<http://localhost:3000/docs>** | Documentação interativa da API |

### Checklist de primeira configuração

1. Abra <http://localhost:3000/settings>
2. Selecione seu provedor de IA
3. Informe sua chave de API (ou configure o Ollama)
4. Clique em "Salvar" (Save)
5. Clique em "Testar Conexão" (Test Connection) para confirmar que funciona
6. Volte ao Painel (Dashboard) e envie seu primeiro currículo!

---

<a id="use-resume-matcher-with-a-coding-agent"></a>

## Usar o Resume Matcher com um agente de código

Já usa Claude Code, Codex, Cursor, GitHub Copilot ou Antigravity? Seu agente consegue fazer todo o trabalho de IA do Resume Matcher, então você **não precisa de chave de API**. O agente lê o seu currículo e as descrições de vaga e escreve as versões adaptadas. O Resume Matcher as armazena, confere que nada foi inventado, calcula a pontuação e renderiza os PDFs. Você revisa e edita tudo no app web.

1. Clone este repositório e abra o seu agente na pasta dele.
2. Peça a ele: *"Configure o Resume Matcher e adapte meu currículo a esta vaga: …"*

O [`AGENTS.md`](AGENTS.md) do repositório (lido por Codex, Cursor, Copilot e Antigravity, e pelo Claude Code por meio do `CLAUDE.md`) direciona o agente para a [skill `resume-matcher`](.claude/skills/resume-matcher/SKILL.md). No Claude Code, ela também é o comando `/resume-matcher`. Então o agente:

- **Instala o app**: localmente com uv e npm, ou com Docker (`docker compose up -d --build`), como você preferir.
- **Ativa o modo agente** depois que você concordar. Você também pode escolher **Agente de código** (Coding agent) em Configurações > Configuração de LLM (Settings > LLM configuration). No modo agente, o app não faz nenhuma chamada de IA por conta própria: botões como Gerar Carta de Apresentação (Generate Cover Letter) mostram um prompt para você colar no seu agente.
- **Cria o seu currículo mestre** a partir do seu PDF ou DOCX, ou fazendo perguntas a você.
- **Adapta um currículo por descrição de vaga**. Cole uma descrição de vaga no chat, ou salve várias como arquivos `.md` ou `.txt` em [`jobs/`](jobs/README.md) e peça que ele adapte seu currículo para cada vaga de lá.
- **Passa o bastão para o app web**: cada currículo adaptado aparece no Painel (Dashboard) em <http://localhost:3000>, onde você o edita e baixa o PDF. As páginas abertas recebem por conta própria o que o agente salvar. Se você tiver edições não salvas na mesma parte, o editor pausa o autosave e pergunta qual versão manter.

O agente trabalha pelo comando `resume-matcher`, que executa as mesmas ferramentas do [servidor MCP](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp) e não precisa de configuração:

```bash
uv run --directory apps/backend resume-matcher --help            # instalação local
docker exec -i -w /app/backend resume-matcher \
  python -m app.mcp_server.cli --help                             # Docker
```

As descrições de vaga (`jobs/`) e os dados do app (`apps/backend/data/`) ficam na sua máquina e estão no gitignore.

> **Por que não usar o provedor da assinatura do Claude?** Essa opção faz o Resume Matcher chamar o Claude por meio do seu plano, o que os termos da Anthropic podem não permitir para apps de terceiros. Com um agente de código, você usa o seu agente por conta própria, e o Resume Matcher nunca o chama.

---

<a id="use-resume-matcher-from-claude-code-or-claude-desktop-mcp"></a>

## Usar o Resume Matcher pelo Claude Code ou Claude Desktop (MCP)

O Resume Matcher inclui um servidor [MCP](https://modelcontextprotocol.io) que permite ao Claude Code, Claude Desktop, Cursor ou Codex controlá-lo diretamente. Ele roda via stdio e **não precisa de chave de API de LLM**: o Claude escreve o conteúdo, e o Resume Matcher armazena, valida, pontua e renderiza. Ele compartilha o banco de dados do app web, então tudo que o Claude salvar aparece na interface.

**Pré-requisito:** uma instalação local (sem Docker). Clone o repositório e rode `cd apps/backend && uv sync` (veja [Configuração do backend](#2-backend-setup)).

### Claude Code

```bash
claude mcp add resume-matcher -- uv run --directory /abs/path/to/Resume-Matcher/apps/backend resume-matcher-mcp
```

### Claude Desktop

Adicione isto ao `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) e reinicie o Claude Desktop:

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

Use o **caminho absoluto** do `uv` em `command` (descubra com `which uv` no macOS/Linux ou `where.exe uv` no Windows). O Claude Desktop não herda o `PATH` do seu shell, então um `uv` sem caminho não é encontrado. No Windows, duplique as barras invertidas nos caminhos do JSON.

### Outros clientes MCP

Cursor, Codex e outros clientes usam o mesmo comando (`uv`) e os mesmos args (`run --directory <path>/apps/backend resume-matcher-mcp`).

### Observações

- **Mesmo checkout, mesmos dados.** Rode o app web a partir do mesmo checkout para que os dois usem o mesmo banco de dados. `DATA_DIR` move o arquivo SQLite; `DATABASE_URL` seleciona o [PostgreSQL](#optional-postgresql) no lugar dele.
- **Frontend para PDF e verify.** A exportação de PDF, `verify_resume`, `tailor_and_verify` e `parse_check_resume` precisam do frontend rodando (padrão <http://localhost:3000>, definido por `FRONTEND_BASE_URL`). As demais ferramentas funcionam sem ele.
- **Docker ainda não é compatível.** O banco de dados do app fica dentro do volume Docker, então um servidor iniciado no host enxergaria um banco vazio.

O servidor expõe ferramentas para listar e ler currículos e vagas, criar um currículo mestre, adicionar uma vaga, adaptar e verificar um currículo (`tailor_and_verify`), fazer o parse-check e pontuá-lo para ATS, exportar um PDF (`export_resume_pdf`) e acompanhar candidaturas. Seu cliente as lista assim que conectado, e as instruções embutidas no servidor guiam o Claude pelo fluxo de trabalho.

---

<a id="common-commands-reference"></a>

## Referência de comandos comuns

### Comandos do backend

```bash
cd apps/backend

# Inicia o servidor de desenvolvimento (com recarga automática)
RELOAD=true uv run app

# Inicia o servidor de produção
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Instala as dependências
uv sync

# Instala com as dependências de desenvolvimento (para testes)
uv sync --group dev

# Roda os testes
uv run pytest

# Verifica se o banco precisa ser resetado (armazenado como arquivos JSON)
ls -la data/
```

### Comandos do frontend

```bash
cd apps/frontend

# Inicia o servidor de desenvolvimento (com Turbopack para refresh rápido)
npm run dev

# Gera o build de produção
npm run build

# Inicia o servidor de produção
npm run start

# Roda o linter
npm run lint

# Formata o código com Oxfmt
npm run format

# Roda em outra porta
npm run dev -- -p 3001
```

### Gerenciamento do banco de dados

O Resume Matcher usa o TinyDB (armazenamento em arquivos JSON). Todos os dados ficam em `apps/backend/data/`:

```bash
# Ver os arquivos do banco
ls apps/backend/data/

# Faz backup dos seus dados
cp -r apps/backend/data apps/backend/data-backup

# Reseta tudo (começa do zero)
rm -rf apps/backend/data
```

---

<a id="troubleshooting"></a>

## Solução de problemas

### O backend não inicia

**Erro:** `ModuleNotFoundError`

Confirme que você está rodando com o `uv`:

```bash
uv run uvicorn app.main:app --reload
```

**Erro:** `LLM_API_KEY not configured`

Verifique se o seu arquivo `.env` tem uma chave de API válida para o provedor escolhido.

### O frontend não inicia

**Erro:** `ECONNREFUSED` ao carregar as páginas

O backend não está rodando. Inicie-o primeiro:

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**Erro:** erros de build ou de TypeScript

Limpe o cache do Next.js:

```bash
rm -rf apps/frontend/.next
npm run dev
```

### O download do PDF falha

**Erro:** `Cannot connect to frontend for PDF generation`

O backend não consegue alcançar o frontend. Verifique:

1. O frontend está rodando
2. `FRONTEND_BASE_URL` no `.env` corresponde à URL do seu frontend
3. `CORS_ORIGINS` inclui a URL do seu frontend

Se o frontend roda na porta 3001:

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Texto em chinês / japonês / coreano aparece como quadrados (□□□) no PDF

O PDF é renderizado pelo Chromium headless, que recorre às fontes do **sistema**
para qualquer glifo que as webfonts embutidas não cubram. Um host Linux headless
geralmente não traz nenhuma fonte CJK, então o texto vira quadrados (tofu).

**Quem usa Docker:** não precisa fazer nada, pois a imagem instala `fonts-noto-cjk`.

**Rodando sem Docker:** instale fontes CJK do sistema na máquina que executa o
backend.

```bash
# Debian / Ubuntu
sudo apt-get install -y fonts-noto-cjk

# Fedora / RHEL
sudo dnf install -y google-noto-sans-cjk-fonts

# Arch
sudo pacman -S noto-fonts-cjk

# macOS: as fontes CJK já vêm com o sistema, nada a fazer
```

Reinicie o backend depois, para que o Chromium reconheça o novo cache de fontes.

### A conexão com o Ollama falha

**Erro:** `Connection refused to localhost:11434`

1. Verifique se o Ollama está rodando: `ollama list`
2. Inicie o Ollama, se necessário: `ollama serve`
3. Confirme que o modelo foi baixado: `ollama pull gemma3:4b`
4. Está rodando o Resume Matcher no Docker? Veja [Usar o Ollama com Docker](#using-ollama-with-docker): a URL Base (Base URL) deve ser `http://host.docker.internal:11434` e, no Linux, o Ollama precisa escutar além de `127.0.0.1`.

---

<a id="project-structure-overview"></a>

## Visão geral da estrutura do projeto

```
Resume-Matcher/
├── apps/
│   ├── backend/                 # Backend Python FastAPI
│   │   ├── app/
│   │   │   ├── main.py          # Ponto de entrada da aplicação
│   │   │   ├── config.py        # Configuração de ambiente
│   │   │   ├── database.py      # Wrapper do TinyDB
│   │   │   ├── llm.py           # Integração com provedores de IA
│   │   │   ├── routers/         # Endpoints da API
│   │   │   ├── services/        # Lógica de negócio
│   │   │   ├── schemas/         # Modelos de dados
│   │   │   └── prompts/         # Modelos de prompt para LLM
│   │   ├── data/                # Armazenamento do banco (criado automaticamente)
│   │   ├── .env.example         # Modelo de ambiente
│   │   └── pyproject.toml       # Dependências Python
│   │
│   └── frontend/                # Frontend Next.js React
│       ├── app/                 # Páginas (dashboard, builder etc.)
│       ├── components/          # Componentes React reutilizáveis
│       ├── lib/                 # Utilitários e cliente da API
│       ├── .env.sample          # Modelo de ambiente
│       └── package.json         # Dependências Node.js
│
├── docker-compose.yml           # Configuração do Docker
├── Dockerfile                   # Instruções de build do contêiner
└── README.md                    # Visão geral do projeto
```

---

<a id="getting-help"></a>

## Obter ajuda

Travou? Estas são as suas opções:

- **Comunidade no Discord:** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - comunidade ativa para dúvidas e discussões
- **GitHub Issues:** [Abra uma issue](https://github.com/srbhr/Resume-Matcher/issues) para bugs ou pedidos de funcionalidade
- **Documentação:** navegue pela [documentação online](https://resumematcher.fyi/docs/) para guias detalhados

---

Bons currículos! Se o Resume Matcher está sendo útil para você, considere [dar uma estrela no repositório](https://github.com/srbhr/Resume-Matcher) e [entrar no nosso Discord](https://dsc.gg/resume-matcher).
