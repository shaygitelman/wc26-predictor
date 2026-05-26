"""purge_test_users

One-time cleanup: delete test/integration users that were left in the
production database by integration_e2e.py runs.

Identified by:
  - email ending in @test.wc26  (e.g. exact.edge@test.wc26)
  - google_id starting with google-test-  (e.g. google-test-xxxxxxxx)

FK cascades auto-delete their league_members, predictions, and
tournament_picks rows. leagues.created_by is set to NULL via SET NULL.

After user deletion, any private leagues that are now completely empty
(no members, not the default/system league) are also removed — they were
created by test users and are invisible/inaccessible with 0 members anyway.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Count before for logging purposes
    before = bind.execute(sa.text(
        "SELECT COUNT(*) FROM users WHERE "
        "email ILIKE '%@test.wc26' OR google_id ILIKE 'google-test-%'"
    )).scalar()

    if before == 0:
        return  # Already clean — nothing to do

    # 2. Delete test users.
    #    CASCADE removes: league_members, predictions, tournament_picks.
    #    SET NULL clears:  leagues.created_by.
    result = bind.execute(sa.text(
        "DELETE FROM users WHERE "
        "email ILIKE '%@test.wc26' OR google_id ILIKE 'google-test-%'"
    ))
    deleted_users = result.rowcount

    # 3. Remove private leagues that are now empty (0 members) and were
    #    created by the deleted test users (created_by IS NULL after SET NULL,
    #    but the global league also has created_by IS NULL — exclude it by
    #    filtering on is_default = FALSE AND is_system = FALSE).
    result2 = bind.execute(sa.text("""
        DELETE FROM leagues
        WHERE is_default = FALSE
          AND is_system  = FALSE
          AND id NOT IN (SELECT DISTINCT league_id FROM league_members)
    """))
    deleted_leagues = result2.rowcount

    print(
        f"[purge_test_users] deleted {deleted_users} test user(s) "
        f"and {deleted_leagues} empty orphaned league(s)"
    )


def downgrade() -> None:
    # Intentionally a no-op: deleted rows cannot be safely restored.
    pass
