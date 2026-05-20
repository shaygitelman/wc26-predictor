"""fix_top_scorer_id_length

top_scorer_id was varchar(20) — too short for UUID strings (36 chars).
Widen to varchar(36) to accommodate player UUIDs.
Also clear any stale non-UUID values (e.g., 'sn1') so old mock data
doesn't sit in a valid-length column disguised as a real pick.

Revision ID: d1e2f3a4b5c6
Revises: c5d6e7f8a9b0
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3a4b5c6'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'tournament_picks',
        'top_scorer_id',
        existing_type=sa.String(length=20),
        type_=sa.String(length=36),
        existing_nullable=True,
    )
    # Null out any stale non-UUID values (length != 36 means it's mock data)
    op.execute(
        "UPDATE tournament_picks SET top_scorer_id = NULL WHERE top_scorer_id IS NOT NULL AND LENGTH(top_scorer_id) != 36"
    )


def downgrade() -> None:
    # Clear UUID values before shrinking so downgrade doesn't truncate
    op.execute(
        "UPDATE tournament_picks SET top_scorer_id = NULL WHERE LENGTH(top_scorer_id) = 36"
    )
    op.alter_column(
        'tournament_picks',
        'top_scorer_id',
        existing_type=sa.String(length=36),
        type_=sa.String(length=20),
        existing_nullable=True,
    )
