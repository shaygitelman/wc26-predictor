"""backfill_onboarding_completed

Set onboarding_completed = TRUE for all pre-existing real users.

When the onboarding_completed column was added (a1b2c3d4e5f6) it defaulted to
FALSE for every row, including real users who had been using the app before
onboarding was introduced. Those users already have a username and avatar so
they are considered onboarded — mark them as such.

Test fixtures (email ILIKE '%@test.wc26' or google_id ILIKE 'google-test-%')
are explicitly excluded so they remain FALSE and are naturally excluded from
any future onboarding-based filters.

Revision ID: d2e3f4a5b6c7
Revises: c3d4e5f6a7b8
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e3f4a5b6c7'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    result = bind.execute(sa.text("""
        UPDATE users
        SET onboarding_completed = TRUE
        WHERE onboarding_completed = FALSE
          AND email     NOT ILIKE '%@test.wc26'
          AND google_id NOT ILIKE 'google-test-%'
    """))

    print(f"[backfill_onboarding_completed] updated {result.rowcount} user(s)")


def downgrade() -> None:
    pass  # intentional no-op — cannot safely revert per-user flag
