"""add_user_privacy_settings

Add six boolean privacy preference columns to the users table.
All default to true (open/social) so existing users are unaffected.

Revision ID: a4b5c6d7e8f9
Revises: e2f3a4b5c6d7
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'a4b5c6d7e8f9'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('hide_picks_until_kickoff', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('profile_public',           sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('show_stats',               sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('show_activity',            sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('show_favorite_team',       sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('allow_league_invites',     sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('users', 'allow_league_invites')
    op.drop_column('users', 'show_favorite_team')
    op.drop_column('users', 'show_activity')
    op.drop_column('users', 'show_stats')
    op.drop_column('users', 'profile_public')
    op.drop_column('users', 'hide_picks_until_kickoff')
