# Database Migrations

This backend now uses Alembic for schema migrations.

## Files
- `alembic.ini` – Alembic configuration.
- `alembic/` – Migration environment.
- `alembic/env.py` – Async-aware migration runner (uses sync for SQLite, async for Postgres).
- `alembic/versions/` – Individual revision scripts.

## Environment URLs
The URL is taken from `SYNC_DATABASE_URL` in `.env` (automatically injected by `settings`).

## Common Commands
(From `apps/backend` directory.)

```bash
# Create new revision after model changes
alembic revision --autogenerate -m "add new table"

# Apply latest migrations
alembic upgrade head

# Downgrade one step
alembic downgrade -1

# Show history
alembic history --verbose
```

## SQLite Notes
SQLite uses `render_as_batch=True` to safely alter tables.

## Postgres Notes
Use full driver URLs:
```
postgresql+psycopg://user:password@host:5432/dbname
postgresql+asyncpg://user:password@host:5432/dbname  # runtime only
```

## Adding Models
1. Define SQLAlchemy model in `app/models/`.
2. Import it in `app/models/__init__.py` if not already indirectly imported.
3. Run `alembic revision --autogenerate -m "describe change"`.
4. Inspect & adjust migration script (indexes, constraints).
5. Run `alembic upgrade head`.

## Troubleshooting
- Mismatch between models and DB: run `alembic revision --autogenerate` and inspect diff.
- Wrong URL: ensure `.env` `SYNC_DATABASE_URL` matches target.
- Stuck locks (Postgres): check active connections before dropping/altering.
