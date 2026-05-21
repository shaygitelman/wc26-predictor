"""add_use_google_avatar

Add use_google_avatar column to preserve avatar reset preference across logins.
When False, the auth endpoint will not overwrite avatar_url from Google OAuth.

Revision ID: f1e2d3c4b5a6
Revises: e2f3a4b5c6d7
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1e2d3c4b5a6'
down_revision = 'a4b5c6d7e8f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('use_google_avatar', sa.Boolean(), nullable=False, server_default='true'),
    )


def downgrade() -> None:
    op.drop_column('users', 'use_google_avatar')
