# Agent Documentation Index

> Complete reference for AI agents working with Resume Matcher.

Start at [/AGENTS.md](/AGENTS.md), then dive into topics below.

## Quick Navigation

### Core Docs
| Doc | Purpose |
|-----|---------|
| [scope-and-principles](scope-and-principles.md) | Rules, what's in/out of scope |
| [quickstart](quickstart.md) | Install, run, test commands |
| [workflow](workflow.md) | Git, PRs, testing |
| [coding-standards](coding-standards.md) | Frontend/backend conventions |

### Architecture
| Doc | Purpose |
|-----|---------|
| [backend-architecture](architecture/backend-architecture.md) | Backend modules, API, services |
| [frontend-architecture](architecture/frontend-architecture.md) | Components, pages, state |

### APIs
| Doc | Purpose |
|-----|---------|
| [front-end-apis](apis/front-end-apis.md) | API contract |
| [api-flow-maps](apis/api-flow-maps.md) | Request/response flows |

### Design
| Doc | Purpose |
|-----|---------|
| [style-guide](design/style-guide.md) | Swiss International Style |
| [template-system](design/template-system.md) | Resume templates |
| [pdf-template-guide](design/pdf-template-guide.md) | PDF rendering |

### Features
| Doc | Purpose |
|-----|---------|
| [custom-sections](features/custom-sections.md) | Dynamic sections |
| [i18n](features/i18n.md) | Internationalization |

### LLM Integration
| Doc | Purpose |
|-----|---------|
| [llm-integration](llm-integration.md) | Multi-provider AI |

## Project Structure

```
apps/
├── backend/                 # FastAPI + Python
│   ├── app/
│   │   ├── main.py          # Entry point
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   └── prompts/         # LLM templates
│   └── data/                # Database storage
│
└── frontend/                # Next.js + React
    ├── app/                 # Pages
    ├── components/          # UI components
    └── lib/                 # Utilities, API client
```

## How to Use

**New tasks:** Read `scope-and-principles` → `quickstart` → `workflow`

**Backend changes:** `backend-architecture` → `front-end-apis` → `llm-integration`

**Frontend changes:** `frontend-architecture` → `style-guide` → `coding-standards`

**Template/PDF changes:** `pdf-template-guide` → `template-system`
