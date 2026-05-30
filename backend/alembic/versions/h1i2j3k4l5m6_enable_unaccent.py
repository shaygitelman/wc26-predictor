"""enable_unaccent

Enable the PostgreSQL unaccent extension so player name searches are
accent-insensitive. Required by the updated /players?search= endpoint.

Revision ID: h1i2j3k4l5m6
Revises: g7h8i9j0k1l2
Create Date: 2026-05-30 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'h1i2j3k4l5m6'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    pass  # never drop unaccent — other code may depend on it
