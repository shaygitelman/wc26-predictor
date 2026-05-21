"""
Diagnose and backfill Match.external_id + Team.external_ids["apifootball"].

Run from backend/:
    python scripts/backfill_external_ids.py           # diagnose + backfill
    python scripts/backfill_external_ids.py --dry-run # diagnose only

What it does
────────────
1. Diagnose: show which matches are missing external_id and which teams are
   missing the "apifootball" key in external_ids.
2. sync_teams  → writes external_ids["apifootball"] for all teams found in
   the WC 2026 API-Football league (league=1, season=2026).
3. sync_fixtures → writes Match.external_id for every fixture returned by
   API-Football. ON CONFLICT DO UPDATE — safe to re-run.
4. sync_players → fetches squad rosters into the players table so the
   squad-availability service can validate player names (optional, slow).
5. Re-diagnose: confirm all gaps are closed.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import func, select, text

from core.config import settings
from core.database import SessionLocal as AsyncSessionLocal
from models.match import Match
from models.player import Player
from models.team import Team
from providers.apifootball import ApiFootballProvider
from services.sync import SyncService

DRY_RUN = "--dry-run" in sys.argv
LEAGUE  = "1"
SEASON  = "2026"

SEP = "─" * 62


def banner(msg: str) -> None:
    print(f"\n{SEP}\n  {msg}\n{SEP}")


async def diagnose(label: str) -> dict:
    """Query DB and print current coverage stats. Returns counts."""
    async with AsyncSessionLocal() as db:
        # Matches
        total_matches = await db.scalar(select(func.count()).select_from(Match))
        matches_with_ext = await db.scalar(
            select(func.count()).select_from(Match).where(Match.external_id.is_not(None))
        )
        # Exclude manual-seed placeholders from "real" count
        matches_real_ext = await db.scalar(
            select(func.count()).select_from(Match).where(
                Match.external_id.is_not(None),
                ~Match.external_id.like("manual-%"),
            )
        )
        matches_no_ext = await db.scalar(
            select(func.count()).select_from(Match).where(Match.external_id.is_(None))
        )
        matches_manual = await db.scalar(
            select(func.count()).select_from(Match).where(
                Match.external_id.like("manual-%")
            )
        )

        # Teams
        total_teams = await db.scalar(select(func.count()).select_from(Team))
        # Teams where external_ids->>'apifootball' IS NOT NULL
        teams_with_apifb = await db.scalar(
            select(func.count()).select_from(Team).where(
                Team.external_ids["apifootball"].as_string() != None  # noqa: E711
            )
        )

        # Players
        total_players = await db.scalar(select(func.count()).select_from(Player))

        # Sample: first 5 matches with no external_id
        missing_matches = (await db.execute(
            select(Match.home_team_code, Match.away_team_code, Match.scheduled_at, Match.round)
            .where(Match.external_id.is_(None))
            .limit(5)
        )).all()

        # Sample: first 5 teams missing apifootball ID
        missing_teams_rows = (await db.execute(
            select(Team.short_code, Team.name, Team.external_ids)
            .where(
                ~Team.external_ids.has_key("apifootball")  # noqa: W601
            )
            .limit(10)
        )).all()

    print(f"\n  [{label}]")
    print(f"  Matches : {total_matches} total | {matches_real_ext} real ext_id "
          f"| {matches_manual} manual-seed | {matches_no_ext} missing")
    print(f"  Teams   : {total_teams} total | {teams_with_apifb} have apifootball ID")
    print(f"  Players : {total_players} total in roster")

    if missing_matches:
        print("  Sample missing match external_ids:")
        for r in missing_matches:
            print(f"    {r.home_team_code} vs {r.away_team_code}  "
                  f"[{r.round}]  {r.scheduled_at.date()}")

    if missing_teams_rows:
        print("  Sample teams missing apifootball ID:")
        for r in missing_teams_rows:
            print(f"    {r.short_code:6s}  {r.name}  existing={r.external_ids}")

    return {
        "total_matches":    total_matches,
        "matches_real_ext": matches_real_ext,
        "matches_no_ext":   matches_no_ext,
        "total_teams":      total_teams,
        "teams_with_apifb": teams_with_apifb,
        "total_players":    total_players,
    }


async def run_sync_teams(svc: SyncService) -> None:
    async with AsyncSessionLocal() as db:
        banner("sync_teams — backfill Team.external_ids['apifootball']")
        result = await svc.sync_teams(db)
        print(f"  status={result.status}  records_affected={result.records_affected}")
        if result.errors:
            print(f"  errors ({len(result.errors)}):")
            for e in result.errors[:10]:
                print(f"    {e}")


async def run_sync_fixtures(svc: SyncService) -> None:
    async with AsyncSessionLocal() as db:
        banner("sync_fixtures — backfill Match.external_id")
        result = await svc.sync_fixtures(db)
        print(f"  status={result.status}  records_affected={result.records_affected}")
        if result.errors:
            print(f"  errors ({len(result.errors)}):")
            for e in result.errors[:10]:
                print(f"    {e}")


async def run_sync_players(svc: SyncService) -> None:
    async with AsyncSessionLocal() as db:
        banner("sync_players — populate player rosters (for name validation)")
        print("  This fetches one API call per team — may take ~2 min for all 48 teams.")
        result = await svc.sync_players(db)
        print(f"  status={result.status}  records_affected={result.records_affected}")
        if result.errors:
            print(f"  errors ({len(result.errors)}):")
            for e in result.errors[:10]:
                print(f"    {e}")


async def main() -> None:
    if not settings.apifootball_key:
        print("ERROR: APIFOOTBALL_KEY is not set in .env — aborting.")
        sys.exit(1)

    print(f"\n  APIFOOTBALL_KEY : {settings.apifootball_key[:8]}…  (set)")
    print(f"  DATABASE_URL    : …{settings.database_url[-40:]}")
    print(f"  DRY_RUN         : {DRY_RUN}")

    banner("BEFORE — current DB state")
    before = await diagnose("before")

    if DRY_RUN:
        print("\n  --dry-run: skipping all writes.")
        return

    needs_teams    = before["teams_with_apifb"] < before["total_teams"]
    needs_fixtures = before["matches_real_ext"] == 0 or before["matches_no_ext"] > 0
    needs_players  = before["total_players"] == 0

    if not needs_teams and not needs_fixtures:
        print("\n  Nothing to backfill — all teams and matches already have API-Football IDs.")
    else:
        svc = SyncService(
            provider  = ApiFootballProvider(settings.apifootball_key),
            league_id = LEAGUE,
            season    = SEASON,
        )

        if needs_teams:
            await run_sync_teams(svc)
        else:
            print("\n  sync_teams — skipped (all teams already have apifootball IDs)")

        if needs_fixtures:
            await run_sync_fixtures(svc)
        else:
            print("\n  sync_fixtures — skipped (all matches already have real external_ids)")

        if needs_players:
            answer = input("\n  Sync player rosters? (~2 min, 48 API calls) [y/N]: ").strip().lower()
            if answer == "y":
                await run_sync_players(svc)
            else:
                print("  sync_players — skipped")
        else:
            print(f"\n  sync_players — skipped ({before['total_players']} players already in DB)")

    banner("AFTER — final DB state")
    after = await diagnose("after")

    # Summary verdict
    print()
    gaps = []
    if after["matches_no_ext"] > 0:
        gaps.append(f"{after['matches_no_ext']} matches still missing external_id")
    if after["teams_with_apifb"] < after["total_teams"]:
        missing = after["total_teams"] - after["teams_with_apifb"]
        gaps.append(f"{missing} teams still missing apifootball ID")
    if after["total_players"] == 0:
        gaps.append("player rosters empty — run again and choose 'y' for sync_players")

    if gaps:
        print("  ⚠  Remaining gaps:")
        for g in gaps:
            print(f"     • {g}")
        print()
    else:
        print("  ✓  All matches and teams have API-Football IDs.")
        if after["total_players"] > 0:
            print(f"  ✓  {after['total_players']} player entries in roster (name validation active).")
        print()


if __name__ == "__main__":
    asyncio.run(main())
