import asyncio
import os
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlalchemy import create_engine
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.engine.url import make_url

from alembic import context

# This is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Provide access to models metadata
import sys
# Ensure backend root (apps/backend) is on sys.path so `import app` resolves
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.models import Base  # type: ignore
from app.core.config import settings  # type: ignore

# Replace alembic.ini sqlalchemy.url dynamically from env
env_db_url = os.getenv("DATABASE_URL", "").strip()
if env_db_url:
    # Normalize postgres prefix and ensure psycopg driver for sync migrations
    if env_db_url.startswith("postgres://"):
        env_db_url = env_db_url.replace("postgres://", "postgresql://", 1)
    if env_db_url.startswith("postgresql://"):
        env_db_url = env_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    config.set_main_option('sqlalchemy.url', env_db_url)
elif settings.SYNC_DATABASE_URL:
    config.set_main_option('sqlalchemy.url', settings.SYNC_DATABASE_URL)

target_metadata = Base.metadata

# Emit a redacted URL for verification without leaking secrets
try:
    _url_val = config.get_main_option("sqlalchemy.url")
    if _url_val:
        # str(make_url()) masks passwords as '***'
        logging.getLogger("alembic").info(
            "Resolved sqlalchemy.url for migrations: %s", str(make_url(_url_val))
        )
except Exception:
    pass

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=True if url.startswith('sqlite') else False,
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.engine.url.get_backend_name() == 'sqlite',
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url")
    # If using a synchronous driver (e.g., psycopg) just run sync migrations path.
    if url.startswith('sqlite') or url.startswith('postgresql+psycopg://') or url.startswith('postgres://'):
        connectable = create_engine(url, poolclass=pool.NullPool, future=True)
        with connectable.connect() as connection:
            do_run_migrations(connection)
        return

    # Otherwise assume async driver (asyncpg) is in use
    connectable = AsyncEngine(
        engine_from_config(
            config.get_section(config.config_ini_section),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
            future=True,
        )
    )
    async with connectable.connect() as connection:  # type: ignore
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
