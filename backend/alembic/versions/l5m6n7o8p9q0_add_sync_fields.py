"""add sync_source and provider_status to matches

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'l5m6n7o8p9q0'
down_revision = 'k4l5m6n7o8p9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('provider_status', sa.String(20), nullable=True))
    op.add_column('matches', sa.Column('sync_source',     sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('matches', 'sync_source')
    op.drop_column('matches', 'provider_status')
