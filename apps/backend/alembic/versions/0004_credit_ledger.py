"""credit ledger schema

Revision ID: 0004_credit_ledger
Revises: 0003_add_performance_indexes
Create Date: 2025-08-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0004_credit_ledger'
down_revision: Union[str, None] = '0003_add_performance_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # stripe_customers
    op.create_table(
        'stripe_customers',
        sa.Column('clerk_user_id', sa.Text(), nullable=False),
        sa.Column('stripe_customer_id', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('clerk_user_id'),
        sa.UniqueConstraint('stripe_customer_id', name='ux_stripe_customers_customer_id')
    )

    # credit_ledger
    op.create_table(
        'credit_ledger',
        sa.Column('id', sa.BigInteger().with_variant(sa.BigInteger(), 'postgresql'), nullable=False),
        sa.Column('clerk_user_id', sa.Text(), nullable=False),
        sa.Column('delta', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('stripe_event_id', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['clerk_user_id'], ['stripe_customers.clerk_user_id'], name='fk_credit_ledger_user', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    # Use identity for Postgres
    op.execute("ALTER TABLE credit_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY")

    # Partial unique index for idempotent Stripe webhook events (only when NOT NULL)
    op.create_index(
        'ux_credit_ledger_stripe_event_id',
        'credit_ledger',
        ['stripe_event_id'],
        unique=True,
        postgresql_where=sa.text('stripe_event_id IS NOT NULL')
    )

    # Helpful index to accelerate per-user reads (optional best practice)
    op.create_index('ix_credit_ledger_user', 'credit_ledger', ['clerk_user_id'], unique=False)

    # View for balances
    op.execute(
        """
        CREATE VIEW v_credit_balance AS
        SELECT clerk_user_id, COALESCE(SUM(delta), 0) AS balance
        FROM credit_ledger
        GROUP BY clerk_user_id;
        """
    )


def downgrade() -> None:
    # Drop view first due to dependency
    op.execute("DROP VIEW IF EXISTS v_credit_balance")

    op.drop_index('ix_credit_ledger_user', table_name='credit_ledger')
    op.drop_index('ux_credit_ledger_stripe_event_id', table_name='credit_ledger')
    op.drop_table('credit_ledger')
    op.drop_table('stripe_customers')
