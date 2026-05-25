"""add_onboarding_completed

Add onboarding_completed column to users table so we can detect first-time users
and gate the onboarding flow before they access the main app.

Revision ID: a1b2c3d4e5f6
Revises: f1e2d3c4b5a6
Create Date: 2026-05-25
"""
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = 'f1e2d3c4b5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed")
