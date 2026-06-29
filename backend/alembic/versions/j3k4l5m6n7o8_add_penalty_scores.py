"""add_penalty_scores

Add penalty_home and penalty_away to matches for ET/PK winner determination.

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-06-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'j3k4l5m6n7o8'
down_revision: Union[str, None] = 'i2j3k4l5m6n7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('penalty_home', sa.Integer(), nullable=True))
    op.add_column('matches', sa.Column('penalty_away', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('matches', 'penalty_away')
    op.drop_column('matches', 'penalty_home')
