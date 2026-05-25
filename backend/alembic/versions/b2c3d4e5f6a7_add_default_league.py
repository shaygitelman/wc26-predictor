"""add_default_league

Add is_default and is_system columns to leagues table.
Seed the platform-wide "MatchPoint26 World League" and backfill all
existing users into it so no one is missing from the global standings.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-25
"""
import uuid
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

# Fixed UUID so every environment gets the exact same default-league ID.
DEFAULT_LEAGUE_ID   = '00000000-0000-0000-0000-000000000001'
DEFAULT_LEAGUE_NAME = 'MatchPoint26 World League'
DEFAULT_INVITE_CODE = 'WORLD001'


def upgrade() -> None:
    # ── 1. Add new columns ────────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE leagues "
        "ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE, "
        "ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT FALSE"
    )

    # ── 2. Create the default league (idempotent) ─────────────────────────────
    op.execute(f"""
        INSERT INTO leagues (id, name, invite_code, created_by, is_default, is_system)
        VALUES (
            '{DEFAULT_LEAGUE_ID}',
            '{DEFAULT_LEAGUE_NAME}',
            '{DEFAULT_INVITE_CODE}',
            NULL,
            TRUE,
            TRUE
        )
        ON CONFLICT (id) DO NOTHING
    """)

    # ── 3. Backfill every existing user into the default league ───────────────
    #    Uses ON CONFLICT DO NOTHING to be safe if the migration is re-run.
    op.execute(f"""
        INSERT INTO league_members (id, league_id, user_id, total_points)
        SELECT
            gen_random_uuid()::text,
            '{DEFAULT_LEAGUE_ID}',
            u.id,
            u.total_points
        FROM users u
        ON CONFLICT ON CONSTRAINT uq_league_members_league_user DO NOTHING
    """)


def downgrade() -> None:
    # Remove all memberships in the default league, then the league itself,
    # then drop the columns.
    op.execute(f"DELETE FROM league_members WHERE league_id = '{DEFAULT_LEAGUE_ID}'")
    op.execute(f"DELETE FROM leagues WHERE id = '{DEFAULT_LEAGUE_ID}'")
    op.execute("ALTER TABLE leagues DROP COLUMN IF EXISTS is_default")
    op.execute("ALTER TABLE leagues DROP COLUMN IF EXISTS is_system")
