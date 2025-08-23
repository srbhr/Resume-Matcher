"""make content_hash nullable

Revision ID: 0002_make_content_hash_nullable
Revises: 0001_initial
Create Date: 2025-08-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0002_make_content_hash_nullable'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Postgres syntax
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.alter_column('content_hash', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.alter_column('content_hash', existing_type=sa.String(), nullable=False)
