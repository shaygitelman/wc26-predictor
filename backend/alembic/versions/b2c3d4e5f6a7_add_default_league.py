"""add_default_league

Add is_default and is_system columns to leagues table.
Seed the platform-wide "MatchPoint26 World League" and backfill all
existing users into it so no one is missing from the global standings.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-25
"""
import uuid as _uuid

from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

# Fixed UUID — every environment gets the same default-league ID.
DEFAULT_LEAGUE_ID   = '00000000-0000-0000-0000-000000000001'
DEFAULT_LEAGUE_NAME = 'MatchPoint26 World League'
DEFAULT_INVITE_CODE = 'WORLD001'


def upgrade() -> None:
    bind = op.get_bind()

    # ── 1. Add new columns ────────────────────────────────────────────────────
    bind.execute(sa.text(
        "ALTER TABLE leagues "
        "ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE, "
        "ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT FALSE"
    ))

    # ── 2. Create the default league (idempotent on both id and invite_code) ──
    bind.execute(sa.text("""
        INSERT INTO leagues (id, name, invite_code, created_by, is_default, is_system)
        VALUES (
            :id,
            :name,
            :code,
            NULL,
            TRUE,
            TRUE
        )
        ON CONFLICT DO NOTHING
    """), {"id": DEFAULT_LEAGUE_ID, "name": DEFAULT_LEAGUE_NAME, "code": DEFAULT_INVITE_CODE})

    # ── 3. Backfill every existing user into the default league ───────────────
    #    Uses Python-generated UUIDs (avoids gen_random_uuid() availability
    #    issues across different PostgreSQL hosting environments).
    #    ON CONFLICT DO NOTHING makes this safe to re-run.
    rows = bind.execute(
        sa.text("SELECT id, COALESCE(total_points, 0) FROM users")
    ).fetchall()

    for user_id, total_points in rows:
        bind.execute(sa.text("""
            INSERT INTO league_members (id, league_id, user_id, total_points)
            VALUES (:id, :league_id, :user_id, :total_points)
            ON CONFLICT ON CONSTRAINT uq_league_members_league_user DO NOTHING
        """), {
            "id":           str(_uuid.uuid4()),
            "league_id":    DEFAULT_LEAGUE_ID,
            "user_id":      user_id,
            "total_points": total_points,
        })


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text(
        f"DELETE FROM league_members WHERE league_id = '{DEFAULT_LEAGUE_ID}'"
    ))
    bind.execute(sa.text(
        f"DELETE FROM leagues WHERE id = '{DEFAULT_LEAGUE_ID}'"
    ))
    bind.execute(sa.text("ALTER TABLE leagues DROP COLUMN IF EXISTS is_default"))
    bind.execute(sa.text("ALTER TABLE leagues DROP COLUMN IF EXISTS is_system"))
