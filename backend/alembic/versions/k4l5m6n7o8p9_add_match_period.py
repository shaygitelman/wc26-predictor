"""add_match_period

Add period column to matches to store live match period ("1H", "HT", "2H", "ET", "P").

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-06-29 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'k4l5m6n7o8p9'
down_revision: Union[str, None] = 'j3k4l5m6n7o8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('period', sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column('matches', 'period')
