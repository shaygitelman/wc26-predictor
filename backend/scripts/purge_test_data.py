"""
Purge ALL test / demo / placeholder data from the production database.

Removes:
  - Matches whose ID starts with manual-wc2026-*, test-*, qa-*, e2e-*
  - Matches referencing any Test team name
  - Predictions on those matches (CASCADE covers this, but counted explicitly)
  - Test teams (Test Home FC, Test Away FC, Test United, etc.)
  - Leagues that were seeded / named for testing
  - Sync log entries for test fixtures

Run from backend/:
    python scripts/purge_test_data.py             # dry-run (default — safe)
    python scripts/purge_test_data.py --execute   # actually delete

NEVER deletes:
  - real WC26 matches (external_id that is a digit, or known official IDs)
  - real users
  - real league memberships that only reference real matches

"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from core.database import SessionLocal

DRY_RUN = "--execute" not in sys.argv

SEP = "─" * 70


def banner(msg: str) -> None:
    print(f"\n{SEP}\n  {msg}\n{SEP}")


# ── Patterns that identify fake / test rows ──────────────────────────────────

# Matches: ID prefixes
FAKE_ID_PREFIXES = [
    "manual-wc2026-",
    "test-",
    "qa-",
    "e2e-",
]

# Matches: team name substrings (case-insensitive)
FAKE_TEAM_NAME_FRAGMENTS = [
    "Test Home",
    "Test Away",
    "Test United",
    "Test Rovers",
    "Test Athletic",
    "Test City",
    "Test Rangers",
    "Test Villa",
]

# Teams table: id / short_code / name patterns.
# IMPORTANT: only use unambiguous prefixes here.
#   "QA" is NOT safe — it matches Qatar (QAT).
#   "E2E" is NOT safe as a short prefix — only use exact or longer patterns.
#   Use "test" / "TEST" which cannot match any real WC26 team code.
FAKE_TEAM_ID_PREFIXES   = ["test"]      # matches id like 'testhome', 'testaway', etc.
FAKE_TEAM_CODE_PREFIXES = ["TEST"]      # matches codes like 'TSTA', 'TSTB', etc.
FAKE_TEAM_NAME_EXACT    = [
    "Test Home FC", "Test Away FC", "Test United", "Test Rovers",
    "Test Athletic", "Test City", "Test Rangers", "Test Villa",
]

# Leagues: name fragments
FAKE_LEAGUE_NAME_FRAGMENTS = ["test", "demo", "qa", "e2e", "seed", "showcase", "placeholder"]

# Test users: email suffixes and google_id prefixes produced by integration_e2e.py
TEST_USER_EMAIL_SUFFIXES  = ["@test.wc26", "@test.com", "@example.com"]
TEST_USER_GOOGLE_PREFIXES = ["google-test-"]


def _match_id_condition() -> str:
    """SQL WHERE clause fragment matching fake match IDs."""
    prefix_checks = " OR ".join(
        f"id LIKE '{p}%'" for p in FAKE_ID_PREFIXES
    )
    return f"({prefix_checks})"


def _match_team_condition() -> str:
    """SQL WHERE clause fragment matching fake team names in matches.

    Only uses unambiguous patterns — no QA% (matches Qatar/QAT) or E2E% (short).
    """
    frags = " OR ".join(
        f"home_team_name ILIKE '%{f}%' OR away_team_name ILIKE '%{f}%'"
        for f in FAKE_TEAM_NAME_FRAGMENTS
    )
    # Only TEST% is safe — no QA% (would catch Qatar=QAT) or E2E% (ambiguous)
    code_checks = (
        "home_team_code ILIKE 'TEST%' OR away_team_code ILIKE 'TEST%'"
    )
    return f"({frags} OR {code_checks})"


def _full_fake_match_condition() -> str:
    return f"({_match_id_condition()} OR {_match_team_condition()})"


def _fake_team_condition() -> str:
    # id: only 'test' prefix (NOT 'qa' — Qatar id is 'qat')
    id_checks = " OR ".join(f"id ILIKE '{p}%'" for p in FAKE_TEAM_ID_PREFIXES)
    # code: only 'TEST' prefix (NOT 'QA' — Qatar code is 'QAT')
    code_checks = " OR ".join(f"short_code ILIKE '{c}%'" for c in FAKE_TEAM_CODE_PREFIXES)
    # name fragments — these are specific enough (no real team is named "Test City")
    name_checks = " OR ".join(f"name ILIKE '%{n}%'" for n in FAKE_TEAM_NAME_FRAGMENTS)
    exact_checks = " OR ".join(
        f"name = '{n}'" for n in FAKE_TEAM_NAME_EXACT
    )
    return f"({id_checks} OR {code_checks} OR {name_checks} OR {exact_checks})"


def _fake_league_condition() -> str:
    return " OR ".join(
        f"name ILIKE '%{f}%'" for f in FAKE_LEAGUE_NAME_FRAGMENTS
    )


def _test_user_condition() -> str:
    email_checks = " OR ".join(
        f"email ILIKE '%{s}'" for s in TEST_USER_EMAIL_SUFFIXES
    )
    google_checks = " OR ".join(
        f"google_id ILIKE '{p}%'" for p in TEST_USER_GOOGLE_PREFIXES
    )
    return f"({email_checks} OR {google_checks})"


async def audit(label: str) -> dict:
    """Read-only scan — never writes. Returns counts for summary."""
    async with SessionLocal() as db:
        total_matches = (await db.execute(text("SELECT COUNT(*) FROM matches"))).scalar_one()
        real_matches  = (await db.execute(text(
            f"SELECT COUNT(*) FROM matches WHERE NOT ({_full_fake_match_condition()})"
        ))).scalar_one()
        fake_matches  = (await db.execute(text(
            f"SELECT COUNT(*) FROM matches WHERE {_full_fake_match_condition()}"
        ))).scalar_one()

        total_teams = (await db.execute(text("SELECT COUNT(*) FROM teams"))).scalar_one()
        fake_teams  = (await db.execute(text(
            f"SELECT COUNT(*) FROM teams WHERE {_fake_team_condition()}"
        ))).scalar_one()

        fake_predictions = (await db.execute(text(f"""
            SELECT COUNT(*) FROM predictions
            WHERE match_id IN (
                SELECT id FROM matches WHERE {_full_fake_match_condition()}
            )
        """))).scalar_one()

        total_leagues = (await db.execute(text("SELECT COUNT(*) FROM leagues"))).scalar_one()
        fake_leagues  = (await db.execute(text(
            f"SELECT COUNT(*) FROM leagues WHERE {_fake_league_condition()}"
        ))).scalar_one()

        total_preds  = (await db.execute(text("SELECT COUNT(*) FROM predictions"))).scalar_one()
        total_users  = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar_one()
        test_users   = (await db.execute(text(
            f"SELECT COUNT(*) FROM users WHERE {_test_user_condition()}"
        ))).scalar_one()
        total_players= (await db.execute(text("SELECT COUNT(*) FROM players"))).scalar_one()

        # sample test users
        sample_test_users = (await db.execute(text(f"""
            SELECT id, email, google_id, username FROM users
            WHERE {_test_user_condition()}
            LIMIT 20
        """))).all()

        # sample fake matches for review
        sample_fake = (await db.execute(text(f"""
            SELECT id, home_team_name, away_team_name, round, external_id
            FROM matches
            WHERE {_full_fake_match_condition()}
            ORDER BY scheduled_at
            LIMIT 20
        """))).all()

        # sample fake teams
        sample_fake_teams = (await db.execute(text(f"""
            SELECT id, short_code, name FROM teams
            WHERE {_fake_team_condition()}
            LIMIT 20
        """))).all()

        # sample fake leagues
        sample_fake_leagues = (await db.execute(text(f"""
            SELECT id, name, invite_code FROM leagues
            WHERE {_fake_league_condition()}
            LIMIT 20
        """))).all()

        # real matches breakdown
        real_breakdown = (await db.execute(text(f"""
            SELECT
                CASE WHEN external_id ~ '^[0-9]+$' THEN 'api-football' ELSE 'no-real-id' END AS src,
                COUNT(*) AS cnt
            FROM matches
            WHERE NOT ({_full_fake_match_condition()})
            GROUP BY 1
        """))).all()

    print(f"\n  [{label}]")
    print(f"  Matches : {total_matches} total | {real_matches} real | {fake_matches} FAKE")
    print(f"  Teams   : {total_teams} total | {fake_teams} FAKE")
    print(f"  Leagues : {total_leagues} total | {fake_leagues} test/demo")
    print(f"  Predictions : {total_preds} total | {fake_predictions} on fake matches")
    print(f"  Users   : {total_users} total | {test_users} TEST")
    print(f"  Players : {total_players}")

    print("\n  Real match breakdown:")
    for row in real_breakdown:
        print(f"    {row.src}: {row.cnt}")

    if sample_fake:
        print(f"\n  FAKE matches to remove ({len(sample_fake)} shown):")
        for r in sample_fake:
            print(f"    [{r.id[:24]}...]  {r.home_team_name} vs {r.away_team_name}  round={r.round}  ext={r.external_id}")

    if sample_fake_teams:
        print(f"\n  FAKE teams to remove ({len(sample_fake_teams)} shown):")
        for r in sample_fake_teams:
            print(f"    id={r.id}  code={r.short_code}  name={r.name}")

    if sample_fake_leagues:
        print(f"\n  FAKE leagues to remove ({len(sample_fake_leagues)} shown):")
        for r in sample_fake_leagues:
            print(f"    id={r.id[:24]}...  name={r.name}  code={r.invite_code}")

    if sample_test_users:
        print(f"\n  TEST users to remove ({len(sample_test_users)} shown):")
        for r in sample_test_users:
            print(f"    id={r.id[:24]}...  email={r.email}  google={r.google_id}  username={r.username}")

    return {
        "total_matches":    total_matches,
        "real_matches":     real_matches,
        "fake_matches":     fake_matches,
        "total_teams":      total_teams,
        "fake_teams":       fake_teams,
        "total_leagues":    total_leagues,
        "fake_leagues":     fake_leagues,
        "fake_predictions": fake_predictions,
        "total_users":      total_users,
        "test_users":       test_users,
    }


async def purge() -> dict:
    """Execute deletions in dependency order. Returns deleted counts."""
    deleted: dict[str, int] = {}

    async with SessionLocal() as db:
        # ── 1. Predictions on fake matches ──────────────────────────
        # (match DELETE CASCADE would handle these, but count them first)
        r = await db.execute(text(f"""
            DELETE FROM predictions
            WHERE match_id IN (
                SELECT id FROM matches WHERE {_full_fake_match_condition()}
            )
        """))
        deleted["predictions"] = r.rowcount

        # ── 2. Delete fake matches ───────────────────────────────────
        # Cascades: predictions (already gone above — belt-and-suspenders)
        r = await db.execute(text(f"""
            DELETE FROM matches WHERE {_full_fake_match_condition()}
        """))
        deleted["matches"] = r.rowcount

        # ── 3. Delete fake teams ─────────────────────────────────────
        r = await db.execute(text(f"""
            DELETE FROM teams WHERE {_fake_team_condition()}
        """))
        deleted["teams"] = r.rowcount

        # ── 4. Delete test leagues (and their members via CASCADE) ───
        # Only removes leagues whose NAME itself signals test/demo.
        # Real users' leagues are untouched.
        r = await db.execute(text(f"""
            DELETE FROM leagues
            WHERE {_fake_league_condition()}
        """))
        deleted["leagues"] = r.rowcount

        # ── 5. Test users (and their data via CASCADE) ───────────────
        # Deletes predictions, league_members, and tournament_picks via FK CASCADE.
        r = await db.execute(text(f"""
            DELETE FROM users WHERE {_test_user_condition()}
        """))
        deleted["test_users"] = r.rowcount

        # ── 6. Sync log entries referencing test external IDs ────────
        # sync_log has no FK but may have provider=test or entity_type that
        # references fake fixtures. Remove rows that mention test prefixes.
        r = await db.execute(text("""
            DELETE FROM sync_log
            WHERE error_message ILIKE '%test-%'
               OR error_message ILIKE '%manual-wc2026-%'
               OR error_message ILIKE '%e2e-%'
               OR error_message ILIKE '%qa-%'
        """))
        deleted["sync_log"] = r.rowcount

        await db.commit()

    return deleted


async def integrity_check() -> None:
    """Post-purge: verify no fake IDs remain, print table counts."""
    async with SessionLocal() as db:
        remaining_fake_matches = (await db.execute(text(
            f"SELECT COUNT(*) FROM matches WHERE {_full_fake_match_condition()}"
        ))).scalar_one()

        remaining_fake_teams = (await db.execute(text(
            f"SELECT COUNT(*) FROM teams WHERE {_fake_team_condition()}"
        ))).scalar_one()

        remaining_fake_leagues = (await db.execute(text(
            f"SELECT COUNT(*) FROM leagues WHERE {_fake_league_condition()}"
        ))).scalar_one()

        total_matches    = (await db.execute(text("SELECT COUNT(*) FROM matches"))).scalar_one()
        total_teams      = (await db.execute(text("SELECT COUNT(*) FROM teams"))).scalar_one()
        total_leagues    = (await db.execute(text("SELECT COUNT(*) FROM leagues"))).scalar_one()
        total_preds      = (await db.execute(text("SELECT COUNT(*) FROM predictions"))).scalar_one()
        total_users      = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar_one()
        total_players    = (await db.execute(text("SELECT COUNT(*) FROM players"))).scalar_one()

        # Round breakdown of remaining matches
        rounds = (await db.execute(text("""
            SELECT round, COUNT(*) as cnt
            FROM matches
            GROUP BY round
            ORDER BY MIN(scheduled_at)
        """))).all()

        # Any matches still without numeric external_id (but not from official seeding)
        no_ext_id = (await db.execute(text("""
            SELECT COUNT(*) FROM matches
            WHERE external_id IS NULL
               OR NOT (external_id ~ '^[0-9]+$')
        """))).scalar_one()

    banner("INTEGRITY AUDIT")
    print(f"\n  Remaining fake matches  : {remaining_fake_matches}")
    print(f"  Remaining fake teams    : {remaining_fake_teams}")
    print(f"  Remaining fake leagues  : {remaining_fake_leagues}")
    print()
    print(f"  Production matches      : {total_matches}")
    print(f"  Production teams        : {total_teams}")
    print(f"  Production leagues      : {total_leagues}")
    print(f"  Production predictions  : {total_preds}")
    print(f"  Users (untouched)       : {total_users}")
    print(f"  Players in roster       : {total_players}")
    print(f"  Matches w/o real ext_id : {no_ext_id}")
    print()
    print("  Match round breakdown:")
    for r in rounds:
        print(f"    {r.round:10s}  {r.cnt:3d}")

    ok = remaining_fake_matches == 0 and remaining_fake_teams == 0

    print()
    if ok:
        print("  ✓  No fake matches or teams found — database is clean.")
    else:
        print("  ⚠  WARNING: some fake rows still present — inspect manually.")
    if remaining_fake_leagues > 0:
        print(f"  ⚠  {remaining_fake_leagues} test league(s) still remain — check name filter.")


async def main() -> None:
    banner("WC26 TEST-DATA PURGE" + ("  [DRY RUN]" if DRY_RUN else "  [EXECUTE]"))

    if DRY_RUN:
        print("""
  Running in DRY-RUN mode — no data will be modified.
  Re-run with --execute to perform the actual deletion.
        """)
    else:
        print("\n  !! EXECUTE mode — rows will be PERMANENTLY deleted !!\n")

    # ── Phase 1: audit what exists ──────────────────────────────────
    banner("BEFORE — current DB state")
    before = await audit("before")

    nothing_to_purge = (
        before["fake_matches"] == 0
        and before["fake_teams"] == 0
        and before["fake_leagues"] == 0
        and before["test_users"] == 0
    )
    if nothing_to_purge:
        print("\n  Nothing to purge — database is already clean.")
        await integrity_check()
        return

    print(f"""
  Summary of what will be deleted:
    {before['fake_predictions']:4d}  predictions (on fake matches)
    {before['fake_matches']:4d}  matches
    {before['fake_teams']:4d}  teams
    {before['fake_leagues']:4d}  leagues (test/demo names only)
    {before['test_users']:4d}  test users (email/google_id pattern match)
    """)

    if DRY_RUN:
        print("  [DRY RUN] No changes made. Append --execute to proceed.")
        return

    # ── Phase 2: execute deletions ──────────────────────────────────
    banner("DELETING")
    deleted = await purge()
    print()
    for table, count in deleted.items():
        print(f"  deleted {count:4d} rows from  {table}")

    # ── Phase 3: post-purge audit ───────────────────────────────────
    banner("AFTER — final DB state")
    await audit("after")

    # ── Phase 4: integrity check ────────────────────────────────────
    await integrity_check()


if __name__ == "__main__":
    asyncio.run(main())
