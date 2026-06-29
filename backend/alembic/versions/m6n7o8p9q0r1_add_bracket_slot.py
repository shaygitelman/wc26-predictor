"""add bracket_slot to matches

Revision ID: m6n7o8p9q0r1
Revises: l5m6n7o8p9q0
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'm6n7o8p9q0r1'
down_revision = 'l5m6n7o8p9q0'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('matches', sa.Column('bracket_slot', sa.String(20), nullable=True))
    op.create_index('ix_matches_bracket_slot', 'matches', ['bracket_slot'])

    conn = op.get_bind()

    # Backfill unreconciled placeholders from external_id
    # 'manual-wc2026-r32-3' → 'r32_03'
    for round_code in ('r32', 'r16', 'qf', 'sf'):
        conn.execute(sa.text("""
            UPDATE matches
            SET bracket_slot = :round || '_' || LPAD(SPLIT_PART(external_id, '-', 4), 2, '0')
            WHERE external_id LIKE :pattern
              AND bracket_slot IS NULL
        """), {'round': round_code, 'pattern': f'manual-wc2026-{round_code}-%'})

    # Special: 3rd and final have no number suffix
    conn.execute(sa.text("UPDATE matches SET bracket_slot='3rd'   WHERE external_id LIKE 'manual-wc2026-3rd-%'   AND bracket_slot IS NULL"))
    conn.execute(sa.text("UPDATE matches SET bracket_slot='final' WHERE external_id LIKE 'manual-wc2026-final-%' AND bracket_slot IS NULL"))

    # Backfill reconciled R32 rows (numeric external_id) by confirmed kickoff time.
    # Slots 1-9 are confirmed by API-Football; slots 10-16 remain as placeholders.
    r32_by_time = [
        ('2026-06-28 21:00:00+00', 'r32_01'),
        ('2026-06-29 17:00:00+00', 'r32_02'),
        ('2026-06-29 21:00:00+00', 'r32_03'),
        ('2026-06-30 14:00:00+00', 'r32_04'),
        ('2026-06-30 18:00:00+00', 'r32_05'),
        ('2026-06-30 21:00:00+00', 'r32_06'),
        ('2026-07-02 21:00:00+00', 'r32_07'),
        ('2026-07-03 17:00:00+00', 'r32_08'),
        ('2026-07-03 21:00:00+00', 'r32_09'),
    ]
    for sched_at, slot in r32_by_time:
        conn.execute(sa.text("""
            UPDATE matches
            SET bracket_slot = :slot
            WHERE round = 'r32'
              AND bracket_slot IS NULL
              AND scheduled_at = :sched_at::timestamptz
        """), {'slot': slot, 'sched_at': sched_at})

def downgrade() -> None:
    op.drop_index('ix_matches_bracket_slot', table_name='matches')
    op.drop_column('matches', 'bracket_slot')
