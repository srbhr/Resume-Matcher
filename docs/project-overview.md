# Project Overview

Resume Matcher is a web-based application that leverages AI to match candidate resumes against job descriptions. It streamlines the recruitment process by automating resume parsing, matching, and ranking, helping recruiters and hiring managers quickly identify the best candidates for a role.

## Key Features

- Upload and parse resumes in PDF/DOCX formats
- Manage job descriptions and required skills
- Intelligent matching and ranking of candidates
- Role-based access control (recruiter, manager, admin)
- Reporting and analytics
- Secure data storage and compliance
- API integration with external HR systems
- Responsive frontend for desktop and mobile

---

# Architecture

## High-Level Diagram

```
+-------------------------------+
|         Frontend (SPA)        |
|  - React/Vue/Next.js          |
|  - Served at /app             |
+-------------------------------+
                |
                v
+-------------------------------+
|        FastAPI Backend        |
|-------------------------------|
| - API endpoints (/api/...)    |
| - Middleware (CORS, sessions) |
| - Exception handling          |
| - Static file serving         |
| - Routers (health, v1)        |
+-------------------------------+
                |
                v
+-------------------------------+
|      Database (SQLAlchemy)    |
|  - Async engine               |
|  - Models (users, resumes,    |
|    jobs, matches, etc.)       |
+-------------------------------+
```

## Component Overview

- **Frontend:** Single-page app (SPA) built with a modern JS framework, served by FastAPI.
- **Backend:** FastAPI application with modular routers, middleware, and exception handlers.
- **Database:** SQLAlchemy models with async engine for scalable data access.
- **Integration:** APIs for external HR systems and job boards.

---

> For more details, see `project-context.md` and `coding-