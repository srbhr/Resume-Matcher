# Guía de configuración de Resume Matcher

[English](SETUP.md) | [**Español**](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

¡Bienvenido! Esta guía te acompaña para configurar Resume Matcher en tu máquina local. Tanto si eres desarrollador y quieres contribuir como si solo quieres ejecutarlo localmente, aquí tienes todo lo necesario.

---

## Tabla de contenidos

- [Requisitos previos](#prerequisites)
- [Inicio rápido](#quick-start)
- [Configuración en Windows 11](#windows-11-setup)
- [Configuración paso a paso](#step-by-step-setup)
  - [1. Clonar el repositorio](#1-clone-the-repository)
  - [2. Configurar el backend](#2-backend-setup)
  - [3. Configurar el frontend](#3-frontend-setup)
- [Configurar tu proveedor de IA](#configuring-your-ai-provider)
  - [Opción A: Proveedores en la nube](#option-a-cloud-providers)
  - [Opción B: IA local con Ollama (gratis)](#option-b-local-ai-with-ollama-free)
  - [Opción C: Tu plan de ChatGPT (Sign in with ChatGPT)](#option-c-your-chatgpt-plan-sign-in-with-chatgpt)
- [Despliegue con Docker](#docker-deployment)
- [Acceder a la aplicación](#accessing-the-application)
- [Usar Resume Matcher desde Claude Code o Claude Desktop (MCP)](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp)
- [Referencia de comandos comunes](#common-commands-reference)
- [Solución de problemas](#troubleshooting)
- [Estructura del proyecto](#project-structure-overview)
- [Obtener ayuda](#getting-help)

---

<a id="prerequisites"></a>
## Requisitos previos

Antes de empezar, asegúrate de tener lo siguiente instalado en tu sistema:

| Herramienta | Versión mínima | Cómo comprobarlo | Instalación |
|------------|-----------------|------------------|-------------|
| **Python** | 3.13+ | `python --version` | [python.org](https://python.org) |
| **Node.js** | 24+ | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | 10+ | `npm --version` | Viene con Node.js |
| **uv** | Última | `uv --version` | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git** | Cualquiera | `git --version` | [git-scm.com](https://git-scm.com) |

### Instalar uv (gestor de paquetes de Python)

Resume Matcher usa `uv` para una gestión de dependencias de Python rápida y fiable. Instálalo con:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# O mediante pip
pip install uv
```

---

<a id="quick-start"></a>
## Inicio rápido

Si ya estás familiarizado con herramientas de desarrollo y quieres arrancar rápido:

```bash
# 1. Clona el repositorio
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 2. Inicia el backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Crea la configuración a partir de la plantilla
uv sync                      # Instala dependencias de Python
uv run app

# 3. Inicia el frontend (Terminal 2)
cd apps/frontend
npm install                  # Instala dependencias de Node.js
npm run dev                  # Arranca el servidor de desarrollo
```

Abre **<http://localhost:3000>** en el navegador y listo.

> **Nota:** antes de usar la app, necesitas configurar un proveedor de IA. Consulta [Configurar tu proveedor de IA](#configuring-your-ai-provider).

---

<a id="windows-11-setup"></a>
## Configuración en Windows 11

Los comandos anteriores y los del resto de esta guía usan sintaxis de shell de macOS/Linux. En Windows 11, usa en su lugar los comandos de **PowerShell** (o Windows Terminal) de esta sección.

### 1. Instalar los requisitos previos

Instala las herramientas de [Requisitos previos](#prerequisites) con `winget` (incluido en Windows 11) y luego **cierra y vuelve a abrir PowerShell** para que estén en tu `PATH`:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
```

También puedes usar los instaladores de los enlaces de la tabla de [Requisitos previos](#prerequisites).

### 2. Descargar el código

Clona con Git:

```powershell
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

O, sin Git, abre la [página del repositorio](https://github.com/srbhr/Resume-Matcher), haz clic en **Code → Download ZIP**, extrae el ZIP y entra con `cd` en la carpeta extraída desde PowerShell.

### 3. Iniciar el backend (ventana 1 de PowerShell)

```powershell
cd apps\backend
Copy-Item .env.example .env   # Crea la configuración a partir de la plantilla
notepad .env                  # Edita la configuración (ver abajo)
uv sync                       # Instala dependencias de Python
uv run app
```

En `.env`, cambia `HOST=0.0.0.0` por `HOST=127.0.0.1` para que el backend solo sea accesible desde tu propia máquina. El valor por defecto escucha en todas las interfaces de red y la API no tiene autenticación, así que otros dispositivos de tu red podrían usar el proveedor de IA que tengas configurado. Opcionalmente, configura aquí tu proveedor de IA y define `RELOAD=true` para recargar automáticamente al cambiar el código.

### 4. Iniciar el frontend (ventana 2 de PowerShell)

Una ventana nueva de PowerShell se abre en tu carpeta de usuario, así que primero cámbiate a la carpeta donde clonaste o extrajiste Resume Matcher (sustituye la ruta por la tuya):

```powershell
cd C:\path\to\Resume-Matcher
cd apps\frontend
npm install
npm run dev
```

Abre **<http://localhost:3000>** en el navegador.

> **Exportar PDF:** Resume Matcher genera los PDF con Chromium headless. Si el navegador de Playwright no está instalado, el backend recurre a Microsoft Edge o Google Chrome si están instalados (Edge viene con Windows 11). También puedes instalar el Chromium de Playwright desde `apps\backend` con `uv run playwright install chromium`.

> **¿Prefieres Docker?** Instala [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) y sigue [Despliegue con Docker](#docker-deployment). Para definir variables como `PORT` en PowerShell, usa `$env:PORT="4000"; docker compose up -d`. Para la [configuración opcional de PostgreSQL](#optional-postgresql), ejecuta `$env:POSTGRES_PASSWORD=[guid]::NewGuid().ToString('N'); docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`; fuera de Docker, define `DATABASE_URL` en `apps\backend\.env`.

---

<a id="step-by-step-setup"></a>
## Configuración paso a paso

<a id="1-clone-the-repository"></a>
### 1. Clonar el repositorio

Primero, trae el código a tu máquina:

```bash
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

<a id="2-backend-setup"></a>
### 2. Configurar el backend

El backend es una aplicación Python (FastAPI) que gestiona el procesamiento de IA, el parseo del currículum y el almacenamiento de datos.

#### Ir al directorio del backend

```bash
cd apps/backend
```

#### Crear tu archivo de entorno

```bash
cp .env.example .env
```

#### Editar el archivo `.env` con tu editor preferido

```bash
# macOS/Linux
nano .env

# O usa el editor que prefieras
code .env   # VS Code
```

El ajuste más importante es tu proveedor de IA. Aquí tienes una configuración mínima para OpenAI:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-nano-2025-08-07
LLM_API_KEY=sk-your-api-key-here

# Mantén estos valores por defecto para desarrollo local
HOST=0.0.0.0
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### Instalar dependencias de Python

```bash
uv sync
```

Esto crea un entorno virtual e instala todos los paquetes requeridos.

#### Iniciar el servidor del backend

```bash
RELOAD=true uv run app
```

Deberías ver una salida como:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**Deja este terminal ejecutándose** y abre un nuevo terminal para el frontend.

<a id="3-frontend-setup"></a>
### 3. Configurar el frontend

El frontend es una aplicación Next.js que proporciona la interfaz de usuario.

#### Ir al directorio del frontend

```bash
cd apps/frontend
```

#### (Opcional) Crear un archivo de entorno para el frontend

Solo es necesario si tu backend se ejecuta en un puerto distinto:

```bash
cp .env.sample .env.local
```

#### Instalar dependencias de Node.js

```bash
npm install
```

#### Iniciar el servidor de desarrollo

```bash
npm run dev
```

Deberías ver:

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

Abre **<http://localhost:3000>** en el navegador. Deberías ver el panel de Resume Matcher.

---

<a id="configuring-your-ai-provider"></a>
## Configurar tu proveedor de IA

Resume Matcher admite múltiples proveedores de IA. Puedes configurarlo desde la página de Settings en la app o editando el archivo `.env` del backend.

<a id="option-a-cloud-providers"></a>
### Opción A: Proveedores en la nube

| Proveedor | Configuración | Obtener API key |
|----------|---------------|-----------------|
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-5-nano-2025-08-07` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **OpenAI-Compatible** | `LLM_PROVIDER=openai_compatible`<br>`LLM_MODEL=llama-3.1-8b`<br>`LLM_API_BASE=http://localhost:8080/v1` | — (local) |

**OpenAI-Compatible** apunta a cualquier servidor local que exponga la API Chat Completions de OpenAI — llama.cpp, vLLM, LM Studio, etc. La API key es opcional.

Ejemplo de `.env` para Anthropic:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>
### Opción B: IA local con Ollama (gratis)

¿Quieres ejecutar modelos localmente sin costes de API? Usa Ollama.

#### Paso 1: Instalar Ollama

Descárgalo e instálalo desde [ollama.com](https://ollama.com)

#### Paso 2: Descargar un modelo

```bash
ollama pull gemma3:4b
```

Otras buenas opciones: `mistral`, `codellama`, `neural-chat`

#### Paso 3: Configurar tu `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY no es necesario con Ollama
```

#### Paso 4: Asegúrate de que Ollama está en ejecución

```bash
ollama serve
```

Normalmente Ollama se inicia automáticamente tras la instalación.

<a id="option-c-your-chatgpt-plan-sign-in-with-chatgpt"></a>
### Opción C: Tu plan de ChatGPT (Sign in with ChatGPT)

Un proveedor creado por la comunidad que usa el [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source) oficial de OpenAI (una versión preliminar, por lo que puede cambiar). Funciona con ChatGPT Plus y Pro, no necesita API key y envía las solicitudes desde tu máquina directamente a la Responses API de OpenAI. El uso cuenta para los límites de tu plan de ChatGPT: en Plus, el límite de cinco horas se comparte con tus otras apps que usan tu plan; Pro no tiene límite de cinco horas. Para tener acceso garantizado, usa una API key de OpenAI.

1. Inicia el backend y el frontend y abre **Settings** en un navegador **de la misma máquina que el backend**.
2. Elige **ChatGPT plan** y haz clic en **Continue with ChatGPT**.
3. Inicia sesión en OpenAI y permite que Resume Matcher use tu plan de ChatGPT. La primera vez, OpenAI registra la app para tu cuenta; los inicios de sesión posteriores reutilizan ese registro.
4. Volverás a Settings. Elige uno de los modelos de tu cuenta y haz clic en **Save**.

OpenAI redirige el navegador a `http://127.0.0.1:<port>/auth/callback`, donde `<port>` es el puerto en el que abriste Resume Matcher (`3000` por defecto). El frontend reenvía esa ruta al backend, y el backend solo acepta la devolución de llamada desde la máquina en la que se ejecuta. Por eso el navegador debe ejecutarse en la máquina que ejecuta Resume Matcher, y debes abrirlo como `http://localhost:<port>` o `http://127.0.0.1:<port>`. Los tokens se guardan cifrados en el directorio de datos del backend (`chatgpt_credentials.enc`). **Disconnect** revoca la sesión en OpenAI y elimina los tokens; **Manage usage** abre los ajustes de uso de tu ChatGPT.

**Docker:** el inicio de sesión funciona con la configuración por defecto, que solo publica el puerto 3000: abre Resume Matcher en `http://localhost:3000` (o en el `PORT` que publicaste) en la máquina que ejecuta el contenedor. OpenAI devuelve el navegador a ese mismo puerto, y el frontend reenvía `/auth/callback` al backend dentro del contenedor. No funciona desde otro ordenador ni a través de un dominio con proxy inverso, porque OpenAI solo permite redirecciones a `http://127.0.0.1`.

El `.env` equivalente (sigues iniciando sesión desde Settings):

```env
LLM_PROVIDER=chatgpt
LLM_MODEL=gpt-6.1-sol  # sustituye por un modelo de la lista de tu cuenta en Settings
```

---

<a id="docker-deployment"></a>
## Despliegue con Docker

¿Prefieres un despliegue en contenedor? Resume Matcher incluye soporte para Docker.

### Usando Docker Compose (recomendado)

```bash
# Construir e iniciar los contenedores
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener los contenedores
docker-compose down
```

<a id="optional-postgresql"></a>
### Opcional: PostgreSQL

SQLite es la opción por defecto y no requiere configuración. Para copias de seguridad, o para mantener la base de datos en otro servidor que controles, puedes usar PostgreSQL en su lugar.

> **Seguridad:** Resume Matcher no tiene cuentas de usuario ni autenticación, y PostgreSQL no añade ninguna. Úsalo solo para ti o en una red privada de confianza, nunca expuesto públicamente. Para cualquier uso más allá del local, conéctate con un rol de base de datos de mínimos privilegios (el usuario `resume` del archivo Compose es superusuario).

Para iniciarlo con Docker Compose:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

`POSTGRES_PASSWORD` se copia tal cual en `DATABASE_URL`, así que usa una contraseña apta para URL (letras, dígitos, `-._~`); `openssl rand -hex 32` genera una. No uses un valor fácil de adivinar. Conserva la contraseña: PostgreSQL la guarda en el volumen `postgres-data` en el primer arranque, y todos los comandos `docker compose` posteriores necesitan el mismo valor (expórtala de nuevo o ponla como `POSTGRES_PASSWORD=...` en un archivo `.env` junto a `docker-compose.yml`).

Fuera de Docker, define `DATABASE_URL=postgresql://user:password@host:5432/dbname` (y opcionalmente `DATABASE_SCHEMA`) en `apps/backend/.env`, codificando con porcentaje cualquier carácter especial de la contraseña. Para una base de datos remota, añade `?sslmode=require` a la URL. Las tablas se crean al iniciar.

Para mover los datos existentes de una instalación local, ejecuta `uv run python -m app.scripts.copy_sqlite_to_postgres` desde `apps/backend` con `DATABASE_URL` definida. Su `--source` por defecto es `apps/backend/data/resume_matcher.db`, que solo existe en instalaciones locales; pasa `--source <file>` para usar otro archivo SQLite. Se niega a escribir en una base de datos que no esté vacía. Detén primero la app: las escrituras posteriores al inicio de la copia no se copian.

Una instalación con Docker guarda su base de datos SQLite en el volumen `resume-data`, no en el host. Detén la app y ejecuta el script dentro del contenedor, donde ese volumen es el origen por defecto (con el mismo `POSTGRES_PASSWORD` definido que antes):

```bash
docker compose stop
docker compose -f docker-compose.yml -f docker-compose.postgres.yml run --rm -w /app/backend resume-matcher python -m app.scripts.copy_sqlite_to_postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Como alternativa, copia el archivo fuera del contenedor detenido (`docker cp resume-matcher:/app/backend/data/resume_matcher.db .`) y pásalo con `--source ./resume_matcher.db` desde un host que pueda acceder a la base de datos. Conserva `data/.secret_key` (permanece en el volumen): descifra tus API keys guardadas.

### Notas importantes sobre Docker

- **Las API keys se configuran desde la UI** en <http://localhost:3000/settings> (no mediante archivos `.env`)
- Los datos se persisten en un volumen de Docker
- Se exponen los puertos del frontend (3000) y del backend (8000)

<!-- Nota: La documentación de Docker está pendiente. Por ahora, usa docker-compose.yml como referencia -->

---

<a id="accessing-the-application"></a>
## Acceder a la aplicación

Cuando ambos servidores estén ejecutándose, abre el navegador:

| URL | Descripción |
|-----|-------------|
| **<http://localhost:3000>** | Aplicación principal (Dashboard) |
| **<http://localhost:3000/settings>** | Configurar proveedor de IA |
| **<http://localhost:8000>** | Raíz de la API del backend |
| **<http://localhost:8000/docs>** | Documentación interactiva de la API |
| **<http://localhost:8000/health>** | Health check del backend |

### Checklist de primera ejecución

1. Abre <http://localhost:3000/settings>
2. Selecciona tu proveedor de IA
3. Introduce tu API key (o configura Ollama)
4. Haz clic en "Save Configuration"
5. Haz clic en "Test Connection" para verificar
6. Vuelve al Dashboard y sube tu primer currículum

---

<a id="use-resume-matcher-from-claude-code-or-claude-desktop-mcp"></a>
## Usar Resume Matcher desde Claude Code o Claude Desktop (MCP)

Resume Matcher incluye un servidor [MCP](https://modelcontextprotocol.io) que permite que Claude Code, Claude Desktop, Cursor o Codex lo controlen directamente. Funciona por stdio y **no necesita ninguna API key de LLM**: Claude escribe el contenido, y Resume Matcher lo almacena, valida, puntúa y renderiza. Comparte la base de datos con la app web, así que todo lo que Claude guarde aparece en la UI.

**Requisito previo:** una instalación local (sin Docker). Clona el repositorio y ejecuta `cd apps/backend && uv sync` (consulta [Configurar el backend](#2-backend-setup)).

### Claude Code

```bash
claude mcp add resume-matcher -- uv run --directory /abs/path/to/Resume-Matcher/apps/backend resume-matcher-mcp
```

### Claude Desktop

Añade esto a `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) y reinicia Claude Desktop:

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

Usa la **ruta absoluta** de `uv` en `command` (búscala con `which uv` en macOS/Linux o `where.exe uv` en Windows). Claude Desktop no hereda el `PATH` de tu shell, por lo que un `uv` a secas no se encuentra. En Windows, duplica las barras invertidas en las rutas del JSON.

### Otros clientes MCP

Cursor, Codex y otros clientes usan el mismo comando (`uv`) y los mismos argumentos (`run --directory <path>/apps/backend resume-matcher-mcp`).

### Notas

- **Mismo repositorio, mismos datos.** Ejecuta la app web desde el mismo repositorio para que ambas usen la misma base de datos. `DATA_DIR` mueve el archivo SQLite; `DATABASE_URL` selecciona [PostgreSQL](#optional-postgresql) en su lugar.
- **Frontend para PDF y verify.** La exportación a PDF, `verify_resume`, `tailor_and_verify` y `parse_check_resume` necesitan el frontend en ejecución (por defecto <http://localhost:3000>, configurable con `FRONTEND_BASE_URL`). Las demás herramientas funcionan sin él.
- **Docker aún no está soportado.** La base de datos de la app vive dentro del volumen de Docker, así que un servidor iniciado en el host vería una base de datos vacía.

El servidor expone herramientas para listar y leer currículums y descripciones de puesto, crear un currículum maestro, guardar una descripción de puesto, adaptar y verificar un currículum (`tailor_and_verify`), revisar su compatibilidad con ATS y puntuarlo, exportar un PDF (`export_resume_pdf`) y gestionar postulaciones. Tu cliente las lista al conectarse, y las instrucciones integradas del servidor guían a Claude por el flujo de trabajo.

---

<a id="common-commands-reference"></a>
## Referencia de comandos comunes

### Comandos del backend

```bash
cd apps/backend

# Iniciar servidor de desarrollo (con auto-reload)
RELOAD=true uv run app

# Iniciar servidor de producción
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Instalar dependencias
uv sync

# Instalar con dependencias de desarrollo (para tests)
uv sync --group dev

# Ejecutar tests
uv run pytest

# Verificar si la base de datos requiere reset (se guarda como JSON)
ls -la data/
```

### Comandos del frontend

```bash
cd apps/frontend

# Iniciar servidor de desarrollo (con Turbopack para refresco rápido)
npm run dev

# Build para producción
npm run build

# Iniciar servidor de producción
npm run start

# Ejecutar linter
npm run lint

# Formatear código con Prettier
npm run format

# Ejecutar en un puerto diferente
npm run dev -- -p 3001
```

### Gestión de base de datos

Resume Matcher usa TinyDB (almacenamiento en archivos JSON). Todos los datos están en `apps/backend/data/`:

```bash
# Ver archivos de la base de datos
ls apps/backend/data/

# Hacer backup de tus datos
cp -r apps/backend/data apps/backend/data-backup

# Resetear todo (empezar de cero)
rm -rf apps/backend/data
```

---

<a id="troubleshooting"></a>
## Solución de problemas

### El backend no arranca

**Error:** `ModuleNotFoundError`

Asegúrate de ejecutar con `uv`:

```bash
uv run uvicorn app.main:app --reload
```

**Error:** `LLM_API_KEY not configured`

Revisa que tu archivo `.env` tenga una API key válida para el proveedor elegido.

### El frontend no arranca

**Error:** `ECONNREFUSED` al cargar páginas

El backend no está en ejecución. Inícialo primero:

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**Error:** errores de build o TypeScript

Limpia la caché de Next.js:

```bash
rm -rf apps/frontend/.next
npm run dev
```

### Fallo al descargar PDF

**Error:** `Cannot connect to frontend for PDF generation`

El backend no puede acceder al frontend. Comprueba:

1. El frontend está en ejecución
2. `FRONTEND_BASE_URL` en `.env` coincide con tu URL del frontend
3. `CORS_ORIGINS` incluye la URL del frontend

Si el frontend corre en el puerto 3001:

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Fallo de conexión con Ollama

**Error:** `Connection refused to localhost:11434`

1. Comprueba que Ollama está en ejecución: `ollama list`
2. Inicia Ollama si es necesario: `ollama serve`
3. Asegúrate de que el modelo está descargado: `ollama pull gemma3:4b`

---

<a id="project-structure-overview"></a>
## Estructura del proyecto

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
## Obtener ayuda

¿Atascado? Estas son tus opciones:

- **Comunidad de Discord:** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - Comunidad activa para preguntas y discusiones
- **Issues de GitHub:** [Abrir un issue](https://github.com/srbhr/Resume-Matcher/issues) para bugs o solicitudes de funcionalidades
- **Documentación:** consulta la [documentación en línea](https://resumematcher.fyi/docs/) para guías detalladas

---

¡Feliz creación de currículums! Si Resume Matcher te resulta útil, considera [darle una estrella al repo](https://github.com/srbhr/Resume-Matcher) y [unirte a nuestro Discord](https://dsc.gg/resume-matcher).

