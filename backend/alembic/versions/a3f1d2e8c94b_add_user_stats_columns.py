"""add_user_stats_columns

Revision ID: a3f1d2e8c94b
Revises: ba6be662d5ea
Create Date: 2026-05-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f1d2e8c94b'
down_revision: Union[str, None] = 'ba6be662d5ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('total_points',        sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('exact_scores',        sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('correct_predictions', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('total_predictions',   sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_users_total_points', 'users', ['total_points'])


def downgrade() -> None:
    op.drop_index('ix_users_total_points', table_name='users')
    op.drop_column('users', 'total_predictions')
    op.drop_column('users', 'correct_predictions')
    op.drop_column('users', 'exact_scores')
    op.drop_column('users', 'total_points')
