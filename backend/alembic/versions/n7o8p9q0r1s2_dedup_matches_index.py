"""add partial unique index to prevent duplicate knockout/group fixtures

Guards against the same real-world fixture (same round, same team pair)
ending up as two DB rows under different external_ids — the root cause of
matches like "Norway vs England" appearing twice. Home/away order doesn't
matter (LEAST/GREATEST), and TBD placeholder rows are excluded since many
of them legitimately share "TBD" as a team code within the same round.

Revision ID: n7o8p9q0r1s2
Revises: m6n7o8p9q0r1
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'n7o8p9q0r1s2'
down_revision = 'm6n7o8p9q0r1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_round_team_pair
        ON matches (round, LEAST(home_team_code, away_team_code), GREATEST(home_team_code, away_team_code))
        WHERE home_team_code NOT IN ('TBD', '') AND away_team_code NOT IN ('TBD', '')
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_matches_round_team_pair"))
