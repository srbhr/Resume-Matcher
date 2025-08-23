"""Quick async connection smoke test for Postgres/Neon.

Usage (PowerShell):
  Set-Location apps/backend
  $env:ASYNC_DATABASE_URL="postgresql+asyncpg://app_user:PASSWORD@ep-XYZ.eu-central-1.aws.neon.tech/neondb?sslmode=require"
  python scripts/smoke_test_neon_async.py
"""
from __future__ import annotations

import asyncio
import os
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine
import sys, pathlib
# Ensure backend root on sys.path so `import app` works when running as a script
BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
from app.core.config import settings as app_settings  # load .env-backed settings


async def main() -> None:
    url = os.environ.get("ASYNC_DATABASE_URL") or app_settings.ASYNC_DATABASE_URL
    if not url:
        raise SystemExit("No ASYNC_DATABASE_URL available")
    engine = create_async_engine(url, echo=False, future=True)
    async with engine.connect() as conn:
        ver = await conn.execute(sa.text("select version()"))
        print("Connected:", ver.scalar())
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
