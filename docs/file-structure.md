# File Structure Conventions

This project follows a modular and organized file structure to ensure maintainability and scalability.  
It is designed for the resume matching domain, focusing on efficient candidate-job matching, secure data handling, and extensibility for recruitment workflows.

## Root Directory

- `apps/` — Main application source code
- `docs/` — Documentation and guides
- `tests/` — Unit and integration tests
- `Makefile` — Build and setup commands
- `.env` — Environment variables
- `README.md` — Project introduction and instructions

## Backend (`apps/backend/`)

- `app/`
  - `api/` — API routers, endpoints, and middleware for resume parsing, job management, and matching logic
  - `core/` — Configuration, settings, and utilities (e.g., matching algorithms, scoring functions)
  - `models/` — Database models (SQLAlchemy) for resumes, jobs, users, matches, and audit logs
  - `base.py` — FastAPI app factory and setup
- `requirements.txt` — Python dependencies

## Frontend (`apps/frontend/`)

- `src/` — Source code (React/Vue/Next.js) for resume upload, job description management, matching results, and analytics dashboards
- `public/` — Static assets
- `package.json` — JS/TS dependencies and scripts

## Tests (`tests/`)

- `backend/` — Python tests (`pytest`) for parsing, matching, and API endpoints
- `frontend/` — JS/TS tests (`jest`, `vitest`) for UI components and matching workflows

## Documentation (`docs/`)

- `project-context.md` — Business requirements for resume matching and recruitment
- `project-overview.md` — Overview and architecture
- `coding-standards.md` — Coding standards
- `style-guide.md` — Style guide

---

...

---

## Preferred Libraries and Frameworks

### Backend (Python)
- **FastAPI** — For building high-performance APIs
- **SQLAlchemy** — For ORM and database models
- **Alembic** — For database migrations
- **Pydantic** — For data validation and settings management
- **pytest** — For unit and integration testing
- **Black** — For code formatting
- **ruff** or **flake8** — For linting

### Frontend (JavaScript/TypeScript)
- **React** (preferred) or **Vue**/**Next.js** — For building SPA user interfaces
- **TypeScript** — For type safety in JS codebases
- **Redux** or **Context API** — For state management
- **Jest**/**Vitest** — For unit testing
- **ESLint** — For linting
- **Prettier** — For code formatting

### General/DevOps
- **Docker** — For containerization and deployment
- **Make** — For build and setup automation
- **GitHub Actions** — For CI/CD pipelines

---

> **Domain Context:**  
> This structure supports features like resume parsing, job description management, candidate-job matching, ranking algorithms, role-based access, reporting, and integration with HR systems.  
> Keep modules small and focused. Use clear, descriptive names for