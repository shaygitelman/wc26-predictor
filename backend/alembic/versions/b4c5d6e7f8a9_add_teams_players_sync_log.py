"""add_teams_players_sync_log

Revision ID: b4c5d6e7f8a9
Revises: a3f1d2e8c94b
Create Date: 2026-05-16 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'a3f1d2e8c94b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── teams ────────────────────────────────────────────────────
    op.create_table(
        'teams',
        sa.Column('id',           sa.String(),        primary_key=True),
        sa.Column('name',         sa.String(100),     nullable=False),
        sa.Column('short_code',   sa.String(10),      nullable=False),
        sa.Column('flag_url',     sa.String(),        nullable=True),
        sa.Column('logo_url',     sa.String(),        nullable=True),
        sa.Column('group_name',   sa.String(5),       nullable=True),
        sa.Column('country_code', sa.String(5),       nullable=True),
        sa.Column('is_confirmed', sa.Boolean(),       nullable=False, server_default='true'),
        sa.Column('external_ids', JSONB(),            nullable=False, server_default='{}'),
        sa.Column('updated_at',   sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── players ──────────────────────────────────────────────────
    op.create_table(
        'players',
        sa.Column('id',            sa.String(),       primary_key=True),
        sa.Column('team_id',       sa.String(),       nullable=True),
        sa.Column('name',          sa.String(100),    nullable=False),
        sa.Column('position',      sa.String(20),     nullable=True),
        sa.Column('shirt_number',  sa.Integer(),      nullable=True),
        sa.Column('photo_url',     sa.String(),       nullable=True),
        sa.Column('date_of_birth', sa.Date(),         nullable=True),
        sa.Column('external_ids',  JSONB(),           nullable=False, server_default='{}'),
        sa.Column('updated_at',    sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_players_team_id', 'players', ['team_id'])

    # ── sync_log ─────────────────────────────────────────────────
    op.create_table(
        'sync_log',
        sa.Column('id',               sa.String(),   primary_key=True),
        sa.Column('provider',         sa.String(50), nullable=False),
        sa.Column('entity_type',      sa.String(50), nullable=False),
        sa.Column('status',           sa.String(20), nullable=False),
        sa.Column('records_affected', sa.Integer(),  nullable=False, server_default='0'),
        sa.Column('error_message',    sa.Text(),     nullable=True),
        sa.Column('started_at',  sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sync_log_provider', 'sync_log', ['provider'])

    # ── external_id on matches ────────────────────────────────────
    op.add_column('matches', sa.Column('external_id', sa.String(50), nullable=True))
    op.create_index('ix_matches_external_id', 'matches', ['external_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_matches_external_id', table_name='matches')
    op.drop_column('matches', 'external_id')
    op.drop_index('ix_sync_log_provider', table_name='sync_log')
    op.drop_table('sync_log')
    op.drop_index('ix_players_team_id', table_name='players')
    op.drop_table('players')
    op.drop_table('teams')
