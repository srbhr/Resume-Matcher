"""Rename compensation_and_benfits to compensation_and_benefits

Revision ID: 001
Revises: 
Create Date: 2025-01-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename compensation_and_benfits to compensation_and_benefits on processed_jobs table."""
    
    # Get the database dialect to handle SQLite vs other databases differently
    conn = op.get_bind()
    dialect_name = conn.dialect.name
    
    if dialect_name == 'sqlite':
        # SQLite doesn't support ALTER COLUMN RENAME directly in all versions
        # We need to use the more complex approach
        # However, since SQLite 3.25.0, it supports ALTER TABLE RENAME COLUMN
        # We'll use batch operations which handles this correctly
        with op.batch_alter_table('processed_jobs', schema=None) as batch_op:
            batch_op.alter_column('compensation_and_benfits',
                                  new_column_name='compensation_and_benefits',
                                  existing_type=sa.JSON(),
                                  existing_nullable=True)
    else:
        # For PostgreSQL, MySQL, etc.
        op.alter_column('processed_jobs', 'compensation_and_benfits',
                       new_column_name='compensation_and_benefits',
                       existing_type=sa.JSON(),
                       existing_nullable=True)


def downgrade() -> None:
    """Rename compensation_and_benefits back to compensation_and_benfits."""
    
    conn = op.get_bind()
    dialect_name = conn.dialect.name
    
    if dialect_name == 'sqlite':
        with op.batch_alter_table('processed_jobs', schema=None) as batch_op:
            batch_op.alter_column('compensation_and_benefits',
                                  new_column_name='compensation_and_benfits',
                                  existing_type=sa.JSON(),
                                  existing_nullable=True)
    else:
        op.alter_column('processed_jobs', 'compensation_and_benefits',
                       new_column_name='compensation_and_benfits',
                       existing_type=sa.JSON(),
                       existing_nullable=True)

