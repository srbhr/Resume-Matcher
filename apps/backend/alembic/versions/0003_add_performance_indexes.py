"""add performance indexes

Revision ID: 0003_add_performance_indexes
Revises: 0002_make_content_hash_nullable
Create Date: 2025-08-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0003_add_performance_indexes'
down_revision: Union[str, None] = '0002_make_content_hash_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Idempotent index creation
    op.create_index('ix_resumes_content_hash', 'resumes', ['content_hash'], unique=False)
    op.create_index('ix_processed_resumes_resume_id', 'processed_resumes', ['resume_id'], unique=False)
    op.create_index('ix_processed_jobs_job_id', 'processed_jobs', ['job_id'], unique=False)
    op.create_index('ix_llm_cache_created_ttl', 'llm_cache', ['created_at', 'ttl_seconds'], unique=False)

def downgrade() -> None:
    op.drop_index('ix_llm_cache_created_ttl', table_name='llm_cache')
    op.drop_index('ix_processed_jobs_job_id', table_name='processed_jobs')
    op.drop_index('ix_processed_resumes_resume_id', table_name='processed_resumes')
    op.drop_index('ix_resumes_content_hash', table_name='resumes')
