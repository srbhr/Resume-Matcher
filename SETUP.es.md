# Guía de configuración de Resume Matcher

[English](SETUP.md) | [**Español**](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

¡Bienvenido! Esta guía te acompaña para configurar Resume Matcher en tu máquina local. Tanto si eres desarrollador y quieres contribuir como si solo quieres ejecutarlo localmente, aquí tienes todo lo necesario.

---

## Tabla de contenidos

- [Requisitos previos](#prerequisites)
- [Inicio rápido](#quick-start)
- [Configuración paso a paso](#step-by-step-setup)
  - [1. Clonar el repositorio](#1-clone-the-repository)
  - [2. Configurar el backend](#2-backend-setup)
  - [3. Configurar el frontend](#3-frontend-setup)
- [Configurar tu proveedor de IA](#configuring-your-ai-provider)
  - [Opción A: Proveedores en la nube](#option-a-cloud-providers)
  - [Opción B: IA local con Ollama (gratis)](#option-b-local-ai-with-ollama-free)
- [Despliegue con Docker](#docker-deployment)
- [Acceder a la aplicación](#accessing-the-application)
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
| **Node.js** | 22+ | `node --version` | [nodejs.org](https://nodejs.org) |
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
uv run uvicorn app.main:app --reload --port 8000

# 3. Inicia el frontend (Terminal 2)
cd apps/frontend
npm install                  # Instala dependencias de Node.js
npm run dev                  # Arranca el servidor de desarrollo
```

Abre **<http://localhost:3000>** en el navegador y listo.

> **Nota:** antes de usar la app, necesitas configurar un proveedor de IA. Consulta [Configurar tu proveedor de IA](#configuring-your-ai-provider).

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
LLM_MODEL=gpt-4o-mini
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
uv run uvicorn app.main:app --reload --port 8000
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
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-3-5-sonnet-20241022` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-1.5-flash` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=anthropic/claude-3.5-sonnet` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |

Ejemplo de `.env` para Anthropic:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_API_KEY=sk-ant-your-key-here
```

<a id="option-b-local-ai-with-ollama-free"></a>
### Opción B: IA local con Ollama (gratis)

¿Quieres ejecutar modelos localmente sin costes de API? Usa Ollama.

#### Paso 1: Instalar Ollama

Descárgalo e instálalo desde [ollama.com](https://ollama.com)

#### Paso 2: Descargar un modelo

```bash
ollama pull llama3.2
```

Otras buenas opciones: `mistral`, `codellama`, `neural-chat`

#### Paso 3: Configurar tu `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY no es necesario con Ollama
```

#### Paso 4: Asegúrate de que Ollama está en ejecución

```bash
ollama serve
```

Normalmente Ollama se inicia automáticamente tras la instalación.

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

<a id="common-commands-reference"></a>
## Referencia de comandos comunes

### Comandos del backend

```bash
cd apps/backend

# Iniciar servidor de desarrollo (con auto-reload)
uv run uvicorn app.main:app --reload --port 8000

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
3. Asegúrate de que el modelo está descargado: `ollama pull llama3.2`

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
├─ docs/                        # Additional documentation
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
- **Documentación:** revisa la carpeta [docs/agent/](docs/agent/) para guías detalladas

### Documentación útil

| Documento | Descripción |
|----------|-------------|
| [backend-guide.md](docs/agent/architecture/backend-guide.md) | Arquitectura del backend y detalles de la API |
| [frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) | Flujo de usuario y arquitectura de componentes |
| [style-guide.md](docs/agent/design/style-guide.md) | Sistema de diseño UI (Swiss International Style) |

---

¡Feliz creación de currículums! Si Resume Matcher te resulta útil, considera [darle una estrella al repo](https://github.com/srbhr/Resume-Matcher) y [unirte a nuestro Discord](https://dsc.gg/resume-matcher).

