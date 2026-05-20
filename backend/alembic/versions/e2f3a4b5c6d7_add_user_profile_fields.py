"""add_user_profile_fields

Add avatar_id and bio to the users table to support the Edit Profile feature.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_id', sa.String(length=50),  nullable=True))
    op.add_column('users', sa.Column('bio',       sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'bio')
    op.drop_column('users', 'avatar_id')
