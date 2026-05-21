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
    # IF NOT EXISTS makes this idempotent — safe whether the column was
    # added manually, by a previous partial deploy, or not at all.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "use_google_avatar BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS use_google_avatar")
