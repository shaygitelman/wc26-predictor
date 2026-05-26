"""add_auto_picks_columns

Revision ID: g7h8i9j0k1l2
Revises: d2e3f4a5b6c7
Create Date: 2026-05-26 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'matches',
        sa.Column('auto_picks_generated', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'predictions',
        sa.Column('is_auto_pick', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'users',
        sa.Column('auto_picks_used', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('users', 'auto_picks_used')
    op.drop_column('predictions', 'is_auto_pick')
    op.drop_column('matches', 'auto_picks_generated')
