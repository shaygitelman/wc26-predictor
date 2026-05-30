"""tournament_scoring

Add tournament scoring infrastructure:
  - tournament_picks: winner_points_awarded, scorer_points_awarded
  - tournament_results: official winner + golden boot record
  - tournament_scoring_runs: audit trail for every scoring run

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-30 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'i2j3k4l5m6n7'
down_revision: Union[str, None] = 'h1i2j3k4l5m6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tournament_picks: track awarded points per category ────────
    # NULL = not yet scored; 0 = scored but pick was wrong; 12 = correct
    op.add_column(
        'tournament_picks',
        sa.Column('winner_points_awarded', sa.Integer(), nullable=True),
    )
    op.add_column(
        'tournament_picks',
        sa.Column('scorer_points_awarded', sa.Integer(), nullable=True),
    )

    # ── tournament_results: single source of truth for official results ──
    # At most one live row (latest by set_at is the active one).
    op.create_table(
        'tournament_results',
        sa.Column('id',               sa.String(36), primary_key=True),
        sa.Column('winner_team_code', sa.String(10),  nullable=True),
        sa.Column('top_scorer_id',    sa.String(36),  nullable=True),
        sa.Column('set_at',    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('set_by',    sa.String(255), nullable=True),
        sa.Column('notes',     sa.String(500), nullable=True),
    )

    # ── tournament_scoring_runs: immutable audit log ───────────────
    op.create_table(
        'tournament_scoring_runs',
        sa.Column('id',     sa.String(36), primary_key=True),
        sa.Column('run_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('winner_team_code', sa.String(10),  nullable=True),
        sa.Column('top_scorer_id',    sa.String(36),  nullable=True),
        sa.Column('winner_pts_delta',     sa.Integer(), nullable=False, default=0),
        sa.Column('scorer_pts_delta',     sa.Integer(), nullable=False, default=0),
        sa.Column('users_affected_winner', sa.Integer(), nullable=False, default=0),
        sa.Column('users_affected_scorer', sa.Integer(), nullable=False, default=0),
        sa.Column('is_correction', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notes',         sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('tournament_scoring_runs')
    op.drop_table('tournament_results')
    op.drop_column('tournament_picks', 'scorer_points_awarded')
    op.drop_column('tournament_picks', 'winner_points_awarded')
