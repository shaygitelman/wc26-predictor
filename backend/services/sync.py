"""
SyncService: provider-agnostic orchestrator that persists data from
any FootballDataProvider into PostgreSQL using idempotent upserts.

Typical call order:
    1. sync_teams()    — populate teams table, enrich flag/logo URLs
    2. sync_fixtures() — populate/update matches table
    3. sync_groups()   — infer group letters from round-1 fixture pairs
    4. sync_players()  — populate players per team (slow; rate-limited)
"""
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.match import Match

log = logging.getLogger(__name__)
from models.player import Player
from models.sync_log import SyncLog
from models.team import Team
from providers.base import FootballDataProvider, ProviderFixture, ProviderTeam  # noqa: F401

# WC 2026: intRound → round code  (TheSportsDB numbering, see providers/thesportsdb.py)
_ROUND_MAP: dict[int, str] = {
    1: "group", 2: "group", 3: "group",
    4: "r32",
    5: "r16",
    6: "qf",
    7: "sf",
    8: "3rd",
    9: "final",
}

# Module-level throttle and monitoring state for sync_live.
# These survive across cron ticks within the same process lifetime on Render.
_last_ko_reconcile_at:         Optional[datetime] = None
_last_pre_kickoff_poll_at:     Optional[datetime] = None  # throttle for 10-60 min pre-kickoff window
_last_sync_at:                 Optional[datetime] = None  # last time a non-skipped sync ran
_last_sync_mode:               str = "never_run"          # full|pre_kickoff|skipped
_last_sync_records_affected:   int = 0
_last_sync_errors:             list[str] = []
_api_calls_today:              int = 0
_api_calls_today_date:         Optional[str] = None       # YYYY-MM-DD; resets counter at midnight


def _ko_winner(
    m: "Match",
    want_winner: bool,
) -> "tuple[str, str, str | None] | None":
    """
    Return (team_code, team_name, flag_url) for the winner (or loser when
    want_winner=False) of a finished knockout match.

    Handles extra time / penalties: when the 90-min score is level the function
    falls back to penalty_home / penalty_away.  Returns None when the outcome
    cannot yet be determined (e.g. still in ET with no penalty data stored).
    """
    h, a = m.home_score, m.away_score
    if h is None or a is None:
        return None
    if h != a:
        use_home = (h > a) == want_winner
    else:
        ph, pa = m.penalty_home, m.penalty_away
        if ph is None or pa is None or ph == pa:
            return None  # ET/PK outcome still unknown
        use_home = (ph > pa) == want_winner
    return (
        (m.home_team_code, m.home_team_name, m.home_flag_url)
        if use_home else
        (m.away_team_code, m.away_team_name, m.away_flag_url)
    )


def _is_tbd_code(code: "str | None") -> bool:
    return (code or "TBD").upper() in ("TBD", "", "NONE")


def _split_ko_placeholders_by_identity(
    placeholders: list["Match"],
) -> "tuple[dict[tuple[str, str], Match], list[Match]]":
    """
    Partition R16+ round placeholders ahead of reconcile_knockout_slots' Phase B.

    Phase A (bracket-slot propagation) may already have written the real
    advancing teams onto a placeholder's home/away codes before Phase B runs.
    Those rows must be matched to their real fixture by team identity, not by
    chronological position — matching by position let a real fixture land on
    whichever placeholder slot merely sorted first among "still unreconciled"
    rows, even when a *different* slot already held the correct teams for that
    exact match. That produced two DB rows for the same real-world fixture
    (e.g. Norway vs England twice, one with a stale placeholder date, one with
    the confirmed date) — this split is what prevents it.

    Returns (by_codes, still_tbd):
      by_codes:  {(HOME, AWAY): placeholder} for both team orders, for any
                 placeholder whose teams are already known.
      still_tbd: placeholders with no known teams yet, in their original
                 (slot-number) order, for positional fallback matching.
    """
    by_codes: dict[tuple[str, str], "Match"] = {}
    still_tbd: list["Match"] = []
    for p in placeholders:
        if _is_tbd_code(p.home_team_code) or _is_tbd_code(p.away_team_code):
            still_tbd.append(p)
        else:
            pair = (p.home_team_code.upper(), p.away_team_code.upper())
            by_codes[pair] = p
            by_codes[(pair[1], pair[0])] = p
    return by_codes, still_tbd


def _fixture_to_new_match_values(fx: "ProviderFixture", round_code: str) -> dict:
    """
    Build the insert values for a real fixture that couldn't be matched to any
    R32 placeholder guess in _R32_LABELS (see reconcile_knockout_slots).

    _R32_LABELS is a hand-picked estimate of the bracket for slots not yet
    confirmed when it was written; if the real pairing (e.g. Spain vs
    Switzerland) doesn't match any guess, the old code silently dropped the
    fixture instead of inserting it. This produces a real Match row so the
    fixture is at least visible with the correct teams/date. It has no
    bracket_slot (the guess table couldn't place it), so it won't participate
    in Phase A bracket propagation until an admin backfills one.
    """
    return dict(
        id             = str(uuid.uuid4()),
        external_id    = fx.external_id,
        home_team_code = fx.home_team_code,
        home_team_name = fx.home_team_name,
        home_flag_url  = fx.home_flag_url,
        away_team_code = fx.away_team_code,
        away_team_name = fx.away_team_name,
        away_flag_url  = fx.away_flag_url,
        scheduled_at   = fx.scheduled_at,
        venue          = fx.venue,
        city           = fx.city,
        round          = round_code,
        status         = fx.status,
        home_score     = fx.home_score,
        away_score     = fx.away_score,
        minute         = fx.minute,
    )


@dataclass
class SyncResult:
    status:           str
    entity_type:      str
    records_affected: int = 0
    errors:           list[str] = field(default_factory=list)


class SyncService:
    def __init__(
        self,
        provider: FootballDataProvider,
        league_id: str = "4429",
        season: str = "2026",
    ):
        self.provider  = provider
        self.league_id = league_id
        self.season    = season

    # ── sync_teams ────────────────────────────────────────────────

    async def sync_teams(self, db: AsyncSession) -> SyncResult:
        log = await self._start_log("teams", db)

        try:
            pteams = await self.provider.fetch_teams(self.league_id)
        except Exception as exc:
            return await self._fail_log(log, str(exc), db)

        count = 0
        errors: list[str] = []

        for t in pteams:
            try:
                team_id = t.short_code.lower()
                stmt = (
                    pg_insert(Team)
                    .values(
                        id           = team_id,
                        name         = t.name,
                        short_code   = t.short_code,
                        flag_url     = t.flag_url,
                        logo_url     = t.logo_url,
                        group_name   = t.group_name,
                        country_code = t.country_code,
                        is_confirmed = True,
                        external_ids = {self.provider.provider_key: t.external_id},
                        updated_at   = datetime.now(timezone.utc),
                    )
                    .on_conflict_do_update(
                        index_elements=["id"],
                        set_={
                            "name":         t.name,
                            "flag_url":     t.flag_url,
                            "logo_url":     t.logo_url,
                            "group_name":   t.group_name,
                            "country_code": t.country_code,
                            # Merge external_ids — preserves IDs from other providers
                            "external_ids": Team.__table__.c.external_ids.op("||")(
                                {self.provider.provider_key: t.external_id}
                            ),
                            "updated_at": datetime.now(timezone.utc),
                        },
                    )
                )
                await db.execute(stmt)

                # Back-fill flag/logo on existing matches that reference this team
                await db.execute(
                    update(Match)
                    .where(Match.home_team_code == t.short_code)
                    .values(home_flag_url=t.flag_url)
                    .execution_options(synchronize_session=False)
                )
                await db.execute(
                    update(Match)
                    .where(Match.away_team_code == t.short_code)
                    .values(away_flag_url=t.flag_url)
                    .execution_options(synchronize_session=False)
                )

                count += 1
            except Exception as exc:
                errors.append(f"{t.name}: {exc}")

        await db.commit()
        return await self._finish_log(
            log, count, "\n".join(errors) if errors else None, db
        )

    # ── sync_fixtures ─────────────────────────────────────────────

    async def sync_fixtures(self, db: AsyncSession) -> SyncResult:
        log = await self._start_log("fixtures", db)

        # Load teams into memory for short_code / flag lookups
        teams_by_ext: dict[str, Team] = await self._teams_by_ext_id(db)

        try:
            fixtures = await self.provider.fetch_fixtures(self.league_id, self.season)
        except Exception as exc:
            return await self._fail_log(log, str(exc), db)

        count = 0
        errors: list[str] = []

        # Auto-create minimal Team entries for any team not already in DB
        seen_ext: set[str] = set()
        for fx in fixtures:
            for ext_id, code, name, flag_url, logo_url in [
                (fx.home_external_id, fx.home_team_code, fx.home_team_name, fx.home_flag_url, fx.home_logo_url),
                (fx.away_external_id, fx.away_team_code, fx.away_team_name, fx.away_flag_url, fx.away_logo_url),
            ]:
                if not ext_id or ext_id in seen_ext or ext_id in teams_by_ext:
                    continue
                seen_ext.add(ext_id)
                team_id = code.lower()
                try:
                    await db.execute(
                        pg_insert(Team)
                        .values(
                            id           = team_id,
                            name         = name,
                            short_code   = code,
                            flag_url     = flag_url,
                            logo_url     = logo_url,
                            external_ids = {self.provider.provider_key: ext_id},
                            updated_at   = datetime.now(timezone.utc),
                        )
                        .on_conflict_do_update(
                            index_elements=["id"],
                            set_={
                                "external_ids": Team.__table__.c.external_ids.op("||")(
                                    {self.provider.provider_key: ext_id}
                                ),
                                "updated_at": datetime.now(timezone.utc),
                            },
                        )
                    )
                    teams_by_ext[ext_id] = Team(  # local cache update
                        id=team_id, name=name, short_code=code,
                        flag_url=flag_url, logo_url=logo_url, group_name=None,
                    )
                except Exception:
                    pass  # best-effort; don't block fixture import

        for fx in fixtures:
            try:
                home_team = teams_by_ext.get(fx.home_external_id)
                away_team = teams_by_ext.get(fx.away_external_id)

                # Prefer DB team data; fall back to what the provider gave us
                home_code    = home_team.short_code if home_team else fx.home_team_code
                away_code    = away_team.short_code if away_team else fx.away_team_code
                home_name    = home_team.name       if home_team else fx.home_team_name
                away_name    = away_team.name       if away_team else fx.away_team_name
                home_flag    = home_team.flag_url   if home_team else fx.home_flag_url
                away_flag    = away_team.flag_url   if away_team else fx.away_flag_url
                home_group   = home_team.group_name if home_team else None
                away_group   = away_team.group_name if away_team else None

                round_code   = _ROUND_MAP.get(fx.int_round, "group")

                if round_code == "group":
                    group_name = home_group or away_group
                    # Provider may supply group letter directly (API-Football does)
                    if fx.group_name:
                        group_name = fx.group_name
                        if not home_group:
                            home_group = group_name
                        if not away_group:
                            away_group = group_name
                else:
                    # Knockout matches have no group; don't inherit from team records
                    group_name = None

                # Two-step build: we need insert_stmt.excluded to write COALESCE
                # expressions that protect non-null venue/city from being overwritten.
                insert_stmt = pg_insert(Match).values(
                    id             = str(uuid.uuid4()),
                    external_id    = fx.external_id,
                    home_team_code = home_code,
                    home_team_name = home_name,
                    home_flag_url  = home_flag,
                    home_group     = home_group,
                    away_team_code = away_code,
                    away_team_name = away_name,
                    away_flag_url  = away_flag,
                    away_group     = away_group,
                    scheduled_at   = fx.scheduled_at,
                    venue          = fx.venue,
                    city           = fx.city,
                    round          = round_code,
                    group_name     = group_name,
                    status         = fx.status,
                    home_score     = fx.home_score,
                    away_score     = fx.away_score,
                    thumb_url      = fx.thumb_url,
                    minute         = fx.minute,
                )
                stmt = insert_stmt.on_conflict_do_update(
                    index_elements=["external_id"],
                    set_={
                        "home_team_code": home_code,
                        "home_team_name": home_name,
                        "home_flag_url":  home_flag,
                        "home_group":     home_group,
                        "away_team_code": away_code,
                        "away_team_name": away_name,
                        "away_flag_url":  away_flag,
                        "away_group":     away_group,
                        "scheduled_at":   fx.scheduled_at,
                        # COALESCE: keep existing venue/city if the provider returns null
                        "venue": func.coalesce(
                            insert_stmt.excluded.venue, Match.__table__.c.venue
                        ),
                        "city": func.coalesce(
                            insert_stmt.excluded.city, Match.__table__.c.city
                        ),
                        # Protect advanced knockout round classifications: if the row
                        # already has round r16/qf/sf/3rd/final (set by seed or a prior
                        # reconcile), do NOT overwrite it with a potentially wrong label
                        # from the API (e.g. "Round of 32" used for TBD fixtures).
                        "round": case(
                            (
                                Match.__table__.c.round.in_(
                                    ["r16", "qf", "sf", "3rd", "final"]
                                ),
                                Match.__table__.c.round,
                            ),
                            else_=insert_stmt.excluded.round,
                        ),
                        "group_name":     group_name,
                        "status":         fx.status,
                        "home_score":     fx.home_score,
                        "away_score":     fx.away_score,
                        "thumb_url":      fx.thumb_url,
                        "minute":         fx.minute,
                        "updated_at":     datetime.now(timezone.utc),
                    },
                )
                await db.execute(stmt)
                count += 1
            except Exception as exc:
                errors.append(f"{fx.external_id}: {exc}")

        await db.commit()
        return await self._finish_log(
            log, count, "\n".join(errors) if errors else None, db
        )

    # ── sync_players ──────────────────────────────────────────────

    async def sync_players(
        self, db: AsyncSession, team_ids: Optional[list[str]] = None
    ) -> SyncResult:
        """
        Sync player rosters. Pass team_ids (lowercase short_code list, e.g. ['bra','fra'])
        to sync specific teams; omit to sync all teams that have a provider external_id.
        Each team requires a separate API call, so this is intentionally slow.
        """
        from datetime import date as date_type

        log = await self._start_log("players", db)

        q = select(Team)
        if team_ids:
            q = q.where(Team.id.in_(team_ids))
        teams = (await db.execute(q)).scalars().all()

        if not teams:
            return await self._finish_log(log, 0, "No teams found in DB", db)

        count = 0
        errors: list[str] = []

        for team in teams:
            ext_id = (team.external_ids or {}).get(self.provider.provider_key)
            if not ext_id:
                errors.append(f"{team.name}: no {self.provider.provider_key} external_id")
                continue

            try:
                raw_players = await self.provider.fetch_players(ext_id)

                # Load all existing players for this team in ONE query (not N queries)
                existing_rows = (
                    await db.execute(select(Player).where(Player.team_id == team.id))
                ).scalars().all()
                existing_by_ext: dict[str, Player] = {
                    (p.external_ids or {}).get(self.provider.provider_key, ""): p
                    for p in existing_rows
                    if (p.external_ids or {}).get(self.provider.provider_key)
                }

                for p in raw_players:
                    dob: Optional[date_type] = None
                    if p.date_of_birth:
                        try:
                            dob = date_type.fromisoformat(p.date_of_birth[:10])
                        except ValueError:
                            pass

                    existing = existing_by_ext.get(p.external_id)
                    if existing:
                        existing.team_id = team.id
                        # Preserve longer names (full names from seeds) over abbreviated
                        # API forms (e.g. keep "Jude Bellingham" over "J. Bellingham").
                        if len(p.name) >= len(existing.name or ''):
                            existing.name = p.name
                        existing.position      = p.position
                        existing.shirt_number  = p.shirt_number
                        existing.photo_url     = p.photo_url
                        existing.date_of_birth = dob
                        existing.external_ids  = {
                            **existing.external_ids,
                            self.provider.provider_key: p.external_id,
                        }
                        existing.updated_at = datetime.now(timezone.utc)
                    else:
                        db.add(Player(
                            id            = str(uuid.uuid4()),
                            team_id       = team.id,
                            name          = p.name,
                            position      = p.position,
                            shirt_number  = p.shirt_number,
                            photo_url     = p.photo_url,
                            date_of_birth = dob,
                            external_ids  = {self.provider.provider_key: p.external_id},
                            updated_at    = datetime.now(timezone.utc),
                        ))

                    count += 1

                # Flush per team so DB pressure stays low for large rosters
                await db.flush()

            except Exception as exc:
                errors.append(f"{team.name}: {exc}")

        await db.commit()
        return await self._finish_log(
            log, count, "\n".join(errors) if errors else None, db
        )

    # ── sync_groups ───────────────────────────────────────────────

    async def sync_groups(
        self,
        db: AsyncSession,
        manual: Optional[dict[str, str]] = None,
    ) -> SyncResult:
        """
        Derive group letters from match data and write them to the teams and
        matches tables.

        WC 2026 uses 12 groups of 4 teams.  Each group plays 6 matches
        (round-robin) across 3 matchdays, with 2 simultaneous matches per
        matchday.  Because multiple different team-pairs can appear in
        matchday-1 of the same group, the old "each unseen pair = new group"
        inference algorithm is unreliable for 4-team groups.

        Strategy (in priority order):
          1. Provider-supplied group_name on Match records (set by
             sync_fixtures() from API-Football's league.group field).
             This is authoritative and handles 4-team groups correctly.
          2. Match-pairing inference (fallback when provider omits group_name).
             Only applied to matches that still lack a group letter after step 1.
          3. Manual override dict {short_code_upper: letter} applied last.

        Pass `manual` as a {short_code_upper: "A"} override dict to set groups
        explicitly when the official FIFA group letters are confirmed.
        """
        _VALID = frozenset("ABCDEFGHIJKL")   # WC 2026 has 12 groups A–L
        log = await self._start_log("groups", db)

        # Load real (provider-synced) group-stage matches ordered by kick-off.
        # Seed fixtures have external_id starting with "manual-wc2026-" which
        # contain group info; raw test fixtures (external_id IS NULL) are excluded.
        group_matches = (
            await db.execute(
                select(Match)
                .where(Match.round == "group", Match.external_id.is_not(None))
                .order_by(Match.scheduled_at)
            )
        ).scalars().all()

        team_group: dict[str, str] = {}   # short_code_upper → group letter

        # ── Step 1: use group_name already on Match records (provider data) ──
        for m in group_matches:
            g = (m.group_name or "").strip().upper()
            if len(g) == 1 and g in _VALID:
                home = m.home_team_code.upper()
                away = m.away_team_code.upper()
                if home != "TBD":
                    team_group[home] = g
                if away != "TBD":
                    team_group[away] = g

        # ── Step 2: match-pairing inference for remaining ungrouped teams ────
        # Only useful when the provider omits league.group (e.g. TheSportsDB).
        # With 4-team groups this can misassign letters when two different
        # MD-1 pairs from the same group both appear without a group_name.
        # It is kept as a best-effort fallback only.
        _LETTERS = "ABCDEFGHIJKL"
        group_idx = sum(1 for letter in set(team_group.values()) if letter in _VALID)

        for m in group_matches:
            if (m.group_name or "").strip().upper() in _VALID:
                continue  # already handled in step 1
            home, away = m.home_team_code.upper(), m.away_team_code.upper()
            if home == "TBD" or away == "TBD":
                continue
            hg = team_group.get(home)
            ag = team_group.get(away)
            if hg and ag:
                pass   # both already assigned
            elif hg:
                team_group[away] = hg
            elif ag:
                team_group[home] = ag
            else:
                if group_idx < len(_LETTERS):
                    g = _LETTERS[group_idx]; group_idx += 1
                    team_group[home] = g; team_group[away] = g

        # ── Step 3: manual overrides ─────────────────────────────
        if manual:
            for code, letter in manual.items():
                team_group[code.upper()] = letter.upper()

        if not team_group:
            return await self._finish_log(log, 0, "No group-stage fixtures found", db)

        # ── Update teams table ───────────────────────────────────
        count = 0
        for code, letter in team_group.items():
            await db.execute(
                update(Team)
                .where(Team.short_code == code)
                .values(group_name=letter, updated_at=datetime.now(timezone.utc))
                .execution_options(synchronize_session=False)
            )
            count += 1

        # ── Update matches table ─────────────────────────────────
        for m in group_matches:
            home_letter = team_group.get(m.home_team_code.upper())
            away_letter = team_group.get(m.away_team_code.upper())
            group_letter = home_letter or away_letter  # both same in same group
            if group_letter:
                await db.execute(
                    update(Match)
                    .where(Match.id == m.id)
                    .values(
                        group_name = group_letter,
                        home_group = home_letter,
                        away_group = away_letter,
                    )
                    .execution_options(synchronize_session=False)
                )

        await db.commit()
        return await self._finish_log(log, count, None, db)

    # ── sync_all ──────────────────────────────────────────────────

    async def sync_all(self, db: AsyncSession) -> list[SyncResult]:
        """Run fixtures → teams → groups in sequence. Safe to call from a cron job."""
        results = []
        results.append(await self.sync_fixtures(db))
        results.append(await self.sync_teams(db))
        results.append(await self.sync_groups(db))
        return results

    # ── sync_venues ──────────────────────────────────────────────

    async def sync_venues(self, db: AsyncSession) -> SyncResult:
        """
        Re-fetch all fixtures from the provider and backfill venue/city for any
        match where the provider now has a value. Never writes null — only moves
        towards having more complete venue data.
        """
        log = await self._start_log("venues", db)

        try:
            fixtures = await self.provider.fetch_fixtures(self.league_id, self.season)
        except Exception as exc:
            return await self._fail_log(log, str(exc), db)

        count  = 0
        errors: list[str] = []

        for fx in fixtures:
            if not fx.venue and not fx.city:
                continue  # provider has nothing to offer for this fixture

            values: dict = {"updated_at": datetime.now(timezone.utc)}
            if fx.venue:
                values["venue"] = fx.venue
            if fx.city:
                values["city"] = fx.city

            try:
                result = await db.execute(
                    update(Match)
                    .where(Match.external_id == fx.external_id)
                    .values(**values)
                    .execution_options(synchronize_session=False)
                )
                if result.rowcount > 0:
                    count += 1
            except Exception as exc:
                errors.append(f"{fx.external_id}: {exc}")

        await db.commit()
        return await self._finish_log(
            log, count, "\n".join(errors) if errors else None, db
        )

    # ── reconcile_fixtures ────────────────────────────────────────

    async def reconcile_fixtures(self, db: AsyncSession) -> SyncResult:
        """
        Map existing matches to real API-Football fixture IDs by matching
        on (home_team_code, away_team_code).  Updates external_id in-place
        so sync_live can find the match by external_id going forward.

        Also updates status, scores, and minute from the API response.
        Calls score_match() for any match that transitions to 'finished'.

        Idempotent: safe to call multiple times.
        Preserves all match UUIDs, user predictions, and points.
        """
        from core.scorer import score_match as do_score
        from datetime import timedelta

        _log_entry = await self._start_log("reconcile", db)

        try:
            fixtures = await self.provider.fetch_fixtures(self.league_id, self.season)
        except Exception as exc:
            return await self._fail_log(_log_entry, str(exc), db)

        # Load only matches that still need reconciliation: those with manual-seeded
        # or null external_ids.  This avoids accidentally overwriting rows that were
        # already correctly mapped by a previous sync_fixtures run.
        from sqlalchemy import or_
        all_matches = (await db.execute(
            select(Match).where(
                or_(
                    Match.external_id.is_(None),
                    Match.external_id.like("manual-%"),
                )
            )
        )).scalars().all()
        by_teams: dict[tuple[str, str], Match] = {
            (m.home_team_code.upper(), m.away_team_code.upper()): m
            for m in all_matches
            if m.home_team_code and m.away_team_code
        }

        count  = 0
        errors: list[str] = []
        # (match_id, home_score, away_score) for matches that transition
        # non-finished → finished.  Scored after the bulk commit so
        # score_match sees fresh DB state (status still non-finished).
        to_score: list[tuple[str, int, int]] = []

        _now = datetime.now(timezone.utc)

        for fx in fixtures:
            try:
                # Skip TBD knockout placeholders
                if not fx.home_team_code or not fx.away_team_code:
                    continue
                if fx.home_team_code.upper() in ("TBD", "?") or \
                        fx.away_team_code.upper() in ("TBD", "?"):
                    continue

                key   = (fx.home_team_code.upper(), fx.away_team_code.upper())
                match = by_teams.get(key)
                if not match:
                    errors.append(
                        f"no DB match for {fx.home_team_code} vs "
                        f"{fx.away_team_code} (API id={fx.external_id})"
                    )
                    continue

                prev_status = match.status
                needs_score = (
                    fx.status == "finished"
                    and prev_status != "finished"
                    and fx.home_score is not None
                    and fx.away_score is not None
                )

                if needs_score:
                    # Only update external_id here — score_match will set
                    # status/scores.  If we committed status='finished' first,
                    # score_match's idempotency guard would skip scoring.
                    await db.execute(
                        update(Match)
                        .where(Match.id == match.id)
                        .values(external_id=fx.external_id, updated_at=_now)
                        .execution_options(synchronize_session=False)
                    )
                    to_score.append((match.id, fx.home_score, fx.away_score))
                else:
                    await db.execute(
                        update(Match)
                        .where(Match.id == match.id)
                        .values(
                            external_id = fx.external_id,
                            status      = fx.status,
                            home_score  = fx.home_score,
                            away_score  = fx.away_score,
                            minute      = fx.minute,
                            updated_at  = _now,
                        )
                        .execution_options(synchronize_session=False)
                    )
                count += 1

            except Exception as exc:
                errors.append(f"{fx.external_id}: {exc}")

        # Commit external_id + status changes before scoring.
        # score_match uses db.get() which pulls fresh data post-commit,
        # and sees status != 'finished' → proceeds with full scoring.
        await db.commit()

        for match_id, home_score, away_score in to_score:
            try:
                log.info(
                    "[Sync/reconcile] AUTO-SCORE match=%s %d-%d",
                    match_id, home_score, away_score,
                )
                await do_score(match_id, home_score, away_score, db)
            except Exception as score_exc:
                log.error(
                    "[Sync/reconcile] SCORE-FAIL match=%s: %s",
                    match_id, score_exc,
                )
                errors.append(f"score {match_id}: {score_exc}")

        return await self._finish_log(
            _log_entry, count, "\n".join(errors) if errors else None, db
        )

    # ── reconcile_knockout_slots ──────────────────────────────────

    async def reconcile_knockout_slots(self, db: AsyncSession) -> SyncResult:
        """
        After the group stage ends, API-Football publishes knockout fixtures with
        real team codes.  This method matches each real API fixture to the
        corresponding DB placeholder (external_id='manual-wc2026-{round}-{slot}')
        by sorting both sides deterministically within each round and zipping
        positionally:
          - API fixtures: sorted by (scheduled_at ASC, numeric fixture ID ASC)
          - DB placeholders: sorted by slot number extracted from external_id suffix

        Updates each placeholder in-place, preserving its UUID (and therefore all
        user predictions attached to it).  Fields updated: external_id, team codes,
        team names, scheduled_at, status, scores, venue, city.

        Also removes orphan rows (numeric external_id, same round, no predictions)
        that may have been created by a prior sync_fixtures call.

        Date-gated: no-ops before 2026-07-01 UTC (bracket cannot be set earlier).
        Idempotent: if no manual-wc2026-* KO rows remain, returns immediately.
        """
        from core.scorer import score_match as do_score
        from datetime import timedelta

        _now = datetime.now(timezone.utc)

        # Date gate — some R32 slots are confirmed as early as late June when
        # individual groups finish their 3rd matchday before the full group stage ends
        _ko_gate = datetime(2026, 6, 26, 0, 0, tzinfo=timezone.utc)
        if _now < _ko_gate:
            log.debug("[Sync/reconcile_knockout] skipped — before group-stage-end gate")
            return SyncResult(status="skipped", entity_type="reconcile_knockout", records_affected=0)

        # Fast path — nothing to reconcile
        unreconciled_count = await db.scalar(
            select(func.count(Match.id)).where(
                Match.external_id.like("manual-wc2026-%"),
                Match.round != "group",
            )
        )
        if not unreconciled_count:
            log.debug("[Sync/reconcile_knockout] no manual KO placeholders — skipped")
            return SyncResult(status="skipped", entity_type="reconcile_knockout", records_affected=0)

        _log_entry = await self._start_log("reconcile_knockout", db)

        count  = 0
        errors: list[str] = []
        to_score: list[tuple[str, int, int]] = []

        def _slot_num(ext_id: str) -> int:
            """Extract slot integer from 'manual-wc2026-r32-7' → 7."""
            try:
                return int(ext_id.rsplit("-", 1)[-1])
            except (ValueError, IndexError):
                return 999

        # ── Phase A: bracket propagation using stable bracket_slot ────────────
        # Uses the official bracket graph (core.bracket.BRACKET_EDGES) keyed on
        # bracket_slot — immune to scheduled_at sort-order changes that broke the
        # old positional-index approach.
        from core.bracket import BRACKET_EDGES

        # Load all knockout matches that have a bracket_slot assigned
        _all_ko = (await db.execute(
            select(Match).where(
                Match.round.in_(["r32", "r16", "qf", "sf", "3rd", "final"]),
                Match.bracket_slot.isnot(None),
            )
        )).scalars().all()
        _slot_map: dict[str, Match] = {m.bracket_slot: m for m in _all_ko}

        for _edge in BRACKET_EDGES:
            _src = _slot_map.get(_edge.source_slot)
            _dst = _slot_map.get(_edge.dest_slot)
            if not _src or not _dst:
                continue
            if _src.status != "finished":
                continue

            _want_winner = (_edge.advancement_type == "winner")
            _team_info = _ko_winner(_src, _want_winner)
            if not _team_info:
                continue

            _t_code, _t_name, _t_flag = _team_info

            if _edge.dest_side == "home":
                _is_tbd = (_dst.home_team_code or "TBD").upper() in ("TBD", "", "NONE")
                if not _is_tbd:
                    log.debug("[Sync/bracket-prop] %s→%s HOME already set to %s — skip",
                              _edge.source_slot, _edge.dest_slot, _dst.home_team_code)
                    continue
                _pv: dict = {"home_team_code": _t_code, "home_team_name": _t_name, "updated_at": _now}
                if _t_flag:
                    _pv["home_flag_url"] = _t_flag
            else:
                _is_tbd = (_dst.away_team_code or "TBD").upper() in ("TBD", "", "NONE")
                if not _is_tbd:
                    log.debug("[Sync/bracket-prop] %s→%s AWAY already set to %s — skip",
                              _edge.source_slot, _edge.dest_slot, _dst.away_team_code)
                    continue
                _pv = {"away_team_code": _t_code, "away_team_name": _t_name, "updated_at": _now}
                if _t_flag:
                    _pv["away_flag_url"] = _t_flag

            _src_score = (
                f"{_src.home_score}-{_src.away_score}"
                + (f" (P {_src.penalty_home}-{_src.penalty_away})" if _src.penalty_home is not None else "")
            )
            log.info(
                "[Sync/bracket-prop] %s %s→%s %s=%s (src: %sv%s %s)",
                _edge.advancement_type.upper(),
                _edge.source_slot, _edge.dest_slot, _edge.dest_side.upper(),
                _t_code, _src.home_team_code, _src.away_team_code, _src_score,
            )
            await db.execute(
                update(Match).where(Match.id == _dst.id)
                .values(**_pv)
                .execution_options(synchronize_session=False)
            )
            count += 1

        await db.flush()

        # ── Phase B: API-driven metadata sync ────────────────────────────────────
        try:
            fixtures = await self.provider.fetch_fixtures(self.league_id, self.season)
        except Exception as exc:
            return await self._fail_log(_log_entry, str(exc), db)

        # Build reverse map: round_code → set of int_round values
        _code_to_int_rounds: dict[str, list[int]] = {}
        for ir, rc in _ROUND_MAP.items():
            _code_to_int_rounds.setdefault(rc, []).append(ir)

        for round_code in ("r32", "r16", "qf", "sf", "3rd", "final"):
            valid_int_rounds = _code_to_int_rounds.get(round_code, [])

            # API fixtures for this round with known (non-TBD) teams
            api_fixtures = sorted(
                [
                    fx for fx in fixtures
                    if fx.int_round in valid_int_rounds
                    and fx.home_team_code
                    and fx.away_team_code
                    and fx.home_team_code.upper() not in ("TBD", "?", "")
                    and fx.away_team_code.upper() not in ("TBD", "?", "")
                ],
                key=lambda x: (
                    x.scheduled_at,
                    int(x.external_id) if x.external_id.isdigit() else 0,
                ),
            )

            # DB placeholders for this round still needing reconciliation
            db_placeholders = sorted(
                (await db.execute(
                    select(Match).where(
                        Match.round == round_code,
                        Match.external_id.like("manual-wc2026-%"),
                    )
                )).scalars().all(),
                key=lambda m: _slot_num(m.external_id or ""),
            )

            if not api_fixtures or not db_placeholders:
                log.info(
                    "[Sync/reconcile_knockout] round=%s skipping: api=%d db_manual=%d",
                    round_code, len(api_fixtures), len(db_placeholders),
                )
                continue

            if round_code == "r32":
                # R32 is published incrementally — each winner/runner-up pair is
                # confirmed as its group finishes, before all 12 groups complete.
                # The 4 best-3rd-place slots require all groups to finish and a
                # FIFA ruling on which 8 of 12 third-place teams qualify.
                # Use label-based matching (group position) instead of positional
                # zip so partial reconciliation works without a count-equality gate.
                from collections import defaultdict as _dd
                from core.wc2026_config import CODE_TO_GROUP as _C2G

                # Compute per-team stats from finished group matches
                _grp_rows = (await db.execute(
                    select(Match).where(
                        Match.round == "group",
                        Match.status == "finished",
                        Match.home_score.isnot(None),
                        Match.away_score.isnot(None),
                    )
                )).scalars().all()
                _pts: dict[str, int] = {}
                _gd:  dict[str, int] = {}
                _gf:  dict[str, int] = {}
                for _gm in _grp_rows:
                    for _code, _f, _a in [
                        (_gm.home_team_code.upper(), _gm.home_score, _gm.away_score),
                        (_gm.away_team_code.upper(), _gm.away_score, _gm.home_score),
                    ]:
                        if _code == "TBD" or _code not in _C2G:
                            continue
                        _pts[_code] = _pts.get(_code, 0) + (3 if _f > _a else 1 if _f == _a else 0)
                        _gd[_code]  = _gd.get(_code, 0) + (_f - _a)
                        _gf[_code]  = _gf.get(_code, 0) + _f

                # Rank each team within their group (pts → GD → GF)
                _by_grp: dict[str, list[str]] = _dd(list)
                for _code in _C2G:
                    _by_grp[_C2G[_code]].append(_code)
                _ranked: dict[str, list[str]] = {
                    _g: sorted(_cc, key=lambda c: (-_pts.get(c, 0), -_gd.get(c, 0), -_gf.get(c, 0)))
                    for _g, _cc in _by_grp.items()
                }

                def _label(code: str) -> str | None:
                    g = _C2G.get(code)
                    if not g:
                        return None
                    try:
                        rk = _ranked[g].index(code) + 1
                    except (KeyError, ValueError):
                        return None
                    if rk == 1:
                        return f"1st Group {g}"
                    if rk == 2:
                        return f"2nd Group {g}"
                    return "Best 3rd Place"

                # All r32 DB rows (placeholders + already-reconciled)
                from models.prediction import Prediction
                _all_r32 = (await db.execute(
                    select(Match).where(Match.round == "r32")
                )).scalars().all()
                # External IDs that were once placeholders but are now reconciled
                _placeholder_ids = {p.id for p in db_placeholders}
                _reconciled_ext: set[str] = {
                    m.external_id
                    for m in _all_r32
                    if m.external_id and m.external_id.isdigit()
                    and m.id not in _placeholder_ids
                }

                _ph_by_label: dict[tuple[str, str], Match] = {}
                for _ph in db_placeholders:
                    _k = (_ph.home_team_name or "", _ph.away_team_name or "")
                    _ph_by_label[_k] = _ph
                _updated_ids: set[str] = set()

                for fx in api_fixtures:
                    try:
                        h_lbl = _label(fx.home_team_code.upper())
                        a_lbl = _label(fx.away_team_code.upper())
                        if not h_lbl or not a_lbl:
                            errors.append(
                                f"r32 {fx.external_id}: can't derive label for "
                                f"{fx.home_team_code}/{fx.away_team_code}"
                            )
                            continue

                        ph = _ph_by_label.get((h_lbl, a_lbl)) or _ph_by_label.get((a_lbl, h_lbl))
                        if not ph or ph.id in _updated_ids:
                            if not ph and fx.external_id not in _reconciled_ext:
                                # _R32_LABELS is a hand-picked guess at the bracket for
                                # slots not yet confirmed; if the real pairing doesn't
                                # match any guess, insert the fixture directly instead
                                # of silently dropping it. It won't carry a bracket_slot
                                # (so Phase A propagation won't advance its winner until
                                # an admin backfills one), but it's visible with correct
                                # teams/date rather than missing entirely.
                                try:
                                    await db.execute(
                                        pg_insert(Match)
                                        .values(**_fixture_to_new_match_values(fx, "r32"))
                                        .on_conflict_do_nothing(index_elements=["external_id"])
                                    )
                                    count += 1
                                    log.warning(
                                        "[Sync/reconcile_knockout] r32 %s: inserted unmatched "
                                        "fixture %s vs %s (labels %s/%s not in _R32_LABELS) — "
                                        "no bracket_slot assigned",
                                        fx.external_id, fx.home_team_code, fx.away_team_code,
                                        h_lbl, a_lbl,
                                    )
                                except Exception as exc:
                                    errors.append(
                                        f"r32 {fx.external_id}: insert-unmatched failed: {exc}"
                                    )
                            continue
                        _updated_ids.add(ph.id)

                        # Remove any duplicate row from sync_fixtures before updating
                        # the placeholder's external_id (avoids unique-constraint clash)
                        _dup = next(
                            (m for m in _all_r32
                             if m.external_id == fx.external_id and m.id != ph.id),
                            None,
                        )
                        if _dup:
                            _pc = await db.scalar(
                                select(func.count()).select_from(Prediction).where(
                                    Prediction.match_id == _dup.id
                                )
                            )
                            if _pc:
                                errors.append(
                                    f"r32 dup ext={_dup.external_id} has {_pc} predictions — cannot remove"
                                )
                                _updated_ids.discard(ph.id)
                                continue
                            await db.delete(_dup)
                            await db.flush()

                        prev_status = ph.status
                        needs_score = (
                            fx.status == "finished"
                            and prev_status != "finished"
                            and fx.home_score is not None
                            and fx.away_score is not None
                        )
                        vals: dict = {
                            "external_id":    fx.external_id,
                            "home_team_code": fx.home_team_code,
                            "away_team_code": fx.away_team_code,
                            "home_team_name": fx.home_team_name,
                            "away_team_name": fx.away_team_name,
                            "scheduled_at":   fx.scheduled_at,
                            "minute":         fx.minute,
                            "updated_at":     _now,
                        }
                        if fx.venue:
                            vals["venue"] = fx.venue
                        if fx.city:
                            vals["city"] = fx.city
                        if fx.home_flag_url:
                            vals["home_flag_url"] = fx.home_flag_url
                        if fx.away_flag_url:
                            vals["away_flag_url"] = fx.away_flag_url
                        if needs_score:
                            vals["status"] = prev_status
                        else:
                            vals["status"]       = fx.status
                            vals["home_score"]   = fx.home_score
                            vals["away_score"]   = fx.away_score
                            vals["penalty_home"] = fx.penalty_home
                            vals["penalty_away"] = fx.penalty_away

                        await db.execute(
                            update(Match)
                            .where(Match.id == ph.id)
                            .values(**vals)
                            .execution_options(synchronize_session=False)
                        )
                        count += 1
                        log.info(
                            "[Sync/reconcile_knockout] r32 %s(%s) vs %s(%s) → slot=%s ext=%s",
                            fx.home_team_code, h_lbl, fx.away_team_code, a_lbl,
                            ph.external_id, fx.external_id,
                        )
                        if needs_score:
                            to_score.append((ph.id, fx.home_score, fx.away_score))

                    except Exception as exc:
                        errors.append(f"r32 {fx.external_id}: {exc}")

                # Secondary TBD date-update pass: API-Football publishes R32 fixture
                # dates (with TBD teams) before all groups finish.  Update scheduled_at
                # on remaining unreconciled placeholders so the app shows the correct
                # match date as soon as the schedule is confirmed — even before teams
                # are known.  Only touches scheduled_at; does not change team codes.
                _tbd_api_r32 = sorted(
                    [
                        fx for fx in fixtures
                        if fx.int_round in valid_int_rounds
                        and fx.home_team_code
                        and fx.home_team_code.upper() in ("TBD", "?", "")
                    ],
                    key=lambda x: (
                        x.scheduled_at,
                        int(x.external_id) if x.external_id.isdigit() else 0,
                    ),
                )
                _remaining_phs = sorted(
                    [ph for ph in db_placeholders if ph.id not in _updated_ids],
                    key=lambda m: _slot_num(m.external_id or ""),
                )
                for _tbd_fx, _tbd_ph in zip(_tbd_api_r32, _remaining_phs):
                    if _tbd_fx.scheduled_at and _tbd_ph.scheduled_at != _tbd_fx.scheduled_at:
                        try:
                            await db.execute(
                                update(Match)
                                .where(Match.id == _tbd_ph.id)
                                .values(scheduled_at=_tbd_fx.scheduled_at, updated_at=_now)
                                .execution_options(synchronize_session=False)
                            )
                            count += 1
                            log.info(
                                "[Sync/reconcile_knockout] r32 TBD date-update slot=%d: %s → %s",
                                _slot_num(_tbd_ph.external_id or ""),
                                _tbd_ph.scheduled_at, _tbd_fx.scheduled_at,
                            )
                        except Exception as exc:
                            errors.append(
                                f"r32 tbd-date slot={_slot_num(_tbd_ph.external_id or '')}: {exc}"
                            )
                continue  # r32 done — move to next round

            # Progressive matching for R16 and later — no count-equality gate.
            # Two-tier matching, in order:
            #   1. Identity match: Phase A (bracket-slot propagation, above) may
            #      have already written the real advancing teams into a
            #      placeholder's home/away codes before this phase runs. If so,
            #      match this fixture to that exact placeholder by team code —
            #      this is authoritative and must win over guesswork.
            #   2. Positional fallback: for placeholders Phase A hasn't resolved
            #      yet (both sides still TBD), fall back to zipping by
            #      chronological order, same as before.
            # Matching purely by position (the old approach) let a real fixture
            # get written onto whichever slot sorted first among "unreconciled"
            # placeholders, even when Phase A had already put the correct teams
            # on a *different* slot — producing two rows for the same real match
            # (one via Phase A's correct slot, one via Phase B's mis-slotted
            # positional guess), each keeping a different external_id/date.
            # Inline per-fixture duplicate removal replaces the old upfront orphan sweep.
            from models.prediction import Prediction

            _all_rnd = (await db.execute(
                select(Match).where(Match.round == round_code)
            )).scalars().all()
            _ph_ids  = {p.id for p in db_placeholders}
            _rec_rnd: set[str] = {
                m.external_id
                for m in _all_rnd
                if m.external_id and m.external_id.isdigit()
                and m.id not in _ph_ids
            }

            _ph_by_codes, _ph_tbd = _split_ko_placeholders_by_identity(db_placeholders)

            _upd_rnd: set[str] = set()
            _ph_iter = iter(_ph_tbd)

            for fx in api_fixtures:
                try:
                    if fx.external_id in _rec_rnd:
                        continue

                    _fx_pair = (fx.home_team_code.upper(), fx.away_team_code.upper())
                    ph = _ph_by_codes.get(_fx_pair) or next(_ph_iter, None)
                    if ph is None:
                        if fx.external_id not in _rec_rnd:
                            errors.append(
                                f"{round_code} {fx.external_id}: no placeholder available"
                            )
                        continue
                    if ph.id in _upd_rnd:
                        continue
                    _upd_rnd.add(ph.id)

                    # Delete duplicate row (same external_id, different DB row)
                    _dup = next(
                        (m for m in _all_rnd
                         if m.external_id == fx.external_id and m.id != ph.id),
                        None,
                    )
                    if _dup:
                        _pc = await db.scalar(
                            select(func.count()).select_from(Prediction).where(
                                Prediction.match_id == _dup.id
                            )
                        )
                        if _pc:
                            errors.append(
                                f"{round_code} dup ext={_dup.external_id} "
                                f"has {_pc} predictions — cannot remove"
                            )
                            _upd_rnd.discard(ph.id)
                            continue
                        await db.delete(_dup)
                        await db.flush()

                    prev_status = ph.status
                    needs_score = (
                        fx.status == "finished"
                        and prev_status != "finished"
                        and fx.home_score is not None
                        and fx.away_score is not None
                    )
                    values: dict = {
                        "external_id":    fx.external_id,
                        "home_team_code": fx.home_team_code,
                        "away_team_code": fx.away_team_code,
                        "home_team_name": fx.home_team_name,
                        "away_team_name": fx.away_team_name,
                        "scheduled_at":   fx.scheduled_at,
                        "minute":         fx.minute,
                        "updated_at":     _now,
                    }
                    if fx.venue:
                        values["venue"] = fx.venue
                    if fx.city:
                        values["city"] = fx.city
                    if fx.home_flag_url:
                        values["home_flag_url"] = fx.home_flag_url
                    if fx.away_flag_url:
                        values["away_flag_url"] = fx.away_flag_url
                    if needs_score:
                        values["status"] = prev_status
                    else:
                        values["status"]       = fx.status
                        values["home_score"]   = fx.home_score
                        values["away_score"]   = fx.away_score
                        values["penalty_home"] = fx.penalty_home
                        values["penalty_away"] = fx.penalty_away

                    await db.execute(
                        update(Match)
                        .where(Match.id == ph.id)
                        .values(**values)
                        .execution_options(synchronize_session=False)
                    )
                    count += 1
                    log.info(
                        "[Sync/reconcile_knockout] %s vs %s → ext=%s round=%s slot=%d",
                        fx.home_team_code, fx.away_team_code,
                        fx.external_id, round_code, _slot_num(ph.external_id or ""),
                    )
                    if needs_score:
                        to_score.append((ph.id, fx.home_score, fx.away_score))

                except Exception as exc:
                    errors.append(f"{round_code} {fx.external_id}: {exc}")

        await db.commit()

        for match_id, home_score, away_score in to_score:
            try:
                log.info(
                    "[Sync/reconcile_knockout] AUTO-SCORE match=%s %d-%d",
                    match_id, home_score, away_score,
                )
                await do_score(match_id, home_score, away_score, db)
            except Exception as score_exc:
                log.error(
                    "[Sync/reconcile_knockout] SCORE-FAIL match=%s: %s",
                    match_id, score_exc,
                )
                errors.append(f"score {match_id}: {score_exc}")

        return await self._finish_log(
            _log_entry, count, "\n".join(errors) if errors else None, db
        )

    # ── sync_live ─────────────────────────────────────────────────

    async def sync_live(self, db: AsyncSession) -> SyncResult:
        """
        Poll the provider for currently live fixtures and update DB.
        When a match transitions to 'finished', score_match() is called so
        user prediction points are awarded automatically.
        When a match transitions to 'live' (after a 60-second buffer), auto-picks
        are generated for any user who has not yet submitted a prediction.
        """
        global _last_ko_reconcile_at, _last_pre_kickoff_poll_at
        global _last_sync_at, _last_sync_mode, _last_sync_records_affected, _last_sync_errors
        global _api_calls_today, _api_calls_today_date
        from datetime import timedelta

        from core.scorer import score_match as do_score
        from services.auto_pick import generate_auto_picks

        _now = datetime.now(timezone.utc)
        _today_str = _now.strftime("%Y-%m-%d")
        if _api_calls_today_date != _today_str:
            _api_calls_today = 0
            _api_calls_today_date = _today_str

        # ── Adaptive polling gate ──────────────────────────────────
        # Priority 1: any live match → full sync every tick (1 min)
        has_live = await db.scalar(select(Match.id).where(Match.status == "live").limit(1))

        # Priority 2: match within 10 min of kickoff → full sync every tick
        has_imminent = await db.scalar(select(Match.id).where(
            Match.status == "scheduled",
            Match.scheduled_at <= _now + timedelta(minutes=10),
            Match.scheduled_at >= _now - timedelta(minutes=5),
        ).limit(1))

        # Priority 3: recently finished (within 10 min) → post-FT polling every tick
        has_post_ft = await db.scalar(select(Match.id).where(
            Match.status == "finished",
            Match.updated_at >= _now - timedelta(minutes=10),
            Match.external_id.isnot(None),
        ).limit(1))

        # Priority 3.5: still "scheduled" well past kickoff → stuck match, needs
        # Phase 3 recovery. Without this, a match whose live-feed update is missed
        # during its narrow has_imminent window falls out of every other bucket
        # (not live, no longer imminent, not finished, not near-future) and the
        # whole sync silently skips forever — Phase 3 never gets a chance to run.
        has_stale_scheduled = await db.scalar(select(Match.id).where(
            Match.status == "scheduled",
            Match.scheduled_at <= _now - timedelta(minutes=5),
        ).limit(1))

        if has_live or has_imminent or has_post_ft or has_stale_scheduled:
            _run_mode = "full"
        else:
            # Priority 4: match 10-60 min from kickoff → pre-kickoff mode, throttled to 5 min
            has_near = await db.scalar(select(Match.id).where(
                Match.status == "scheduled",
                Match.scheduled_at > _now + timedelta(minutes=10),
                Match.scheduled_at <= _now + timedelta(minutes=60),
            ).limit(1))

            if not has_near:
                _last_sync_mode = "skipped"
                log.info("[Sync/live] SKIP — no live, imminent, post-FT, stale-scheduled, or near-kickoff matches at %s", _now.isoformat())
                return SyncResult(status="skipped", entity_type="live", records_affected=0)

            if _last_pre_kickoff_poll_at and _now < _last_pre_kickoff_poll_at + timedelta(minutes=5):
                _last_sync_mode = "skipped"
                log.info(
                    "[Sync/live] SKIP — pre-kickoff 5-min throttle (last=%s)",
                    _last_pre_kickoff_poll_at.isoformat(),
                )
                return SyncResult(status="skipped", entity_type="live", records_affected=0)

            _last_pre_kickoff_poll_at = _now
            _run_mode = "pre_kickoff"  # reconcile only — no live feed, no stale checks

        log.info("[Sync/live] START mode=%s at %s", _run_mode, _now.isoformat())
        _log_entry = await self._start_log("live", db)

        count              = 0
        errors: list[str]  = []
        live_ext_ids_seen: set[str] = set()

        if _run_mode != "pre_kickoff":
            # ── Phase 1: bulk live feed ───────────────────────────
            try:
                fixtures = await self.provider.fetch_live(self.league_id)
                _api_calls_today += 1
            except Exception as exc:
                return await self._fail_log(_log_entry, str(exc), db)

            log.info("[Sync/live] fetch_live returned %d fixture(s)", len(fixtures))
            for _fx in fixtures:
                log.info(
                    "[Sync/live] feed: ext=%s %sv%s status=%s period=%s min=%s score=%s-%s",
                    _fx.external_id, _fx.home_team_code, _fx.away_team_code,
                    _fx.status, _fx.period, _fx.minute, _fx.home_score, _fx.away_score,
                )

            for fx in fixtures:
                try:
                    match = await db.scalar(
                        select(Match).where(Match.external_id == fx.external_id)
                    )
                    if not match:
                        log.info(
                            "[Sync/live] Phase1 SKIP ext=%s %sv%s — no DB row with this external_id",
                            fx.external_id, fx.home_team_code, fx.away_team_code,
                        )
                        continue

                    live_ext_ids_seen.add(fx.external_id)
                    prev_status = match.status

                    await db.execute(
                        update(Match)
                        .where(Match.id == match.id)
                        .values(
                            status          = fx.status,
                            home_score      = fx.home_score,
                            away_score      = fx.away_score,
                            penalty_home    = fx.penalty_home,
                            penalty_away    = fx.penalty_away,
                            period          = fx.period,
                            provider_status = fx.provider_status,
                            minute          = fx.minute,
                            sync_source     = "live_feed",
                            updated_at      = datetime.now(timezone.utc),
                        )
                        .execution_options(synchronize_session=False)
                    )
                    count += 1
                    log.info(
                        "[Sync/live] Phase1 UPDATE match=%s ext=%s %sv%s %s→%s min=%s period=%s score=%s-%s",
                        match.id, fx.external_id,
                        fx.home_team_code, fx.away_team_code,
                        prev_status, fx.status, fx.minute, fx.period,
                        fx.home_score, fx.away_score,
                    )

                    buffer_elapsed = (
                        datetime.now(timezone.utc) >= match.scheduled_at + timedelta(seconds=60)
                    )
                    if fx.status == "live" and buffer_elapsed and not match.auto_picks_generated:
                        log.info(
                            "[Sync/live] AUTO-PICK trigger match=%s external=%s round=%s",
                            match.id, fx.external_id, match.round,
                        )
                        try:
                            n = await generate_auto_picks(match.id, match.round, db)
                            if n >= 0:
                                await db.execute(
                                    update(Match)
                                    .where(Match.id == match.id)
                                    .values(auto_picks_generated=True)
                                    .execution_options(synchronize_session=False)
                                )
                        except Exception as auto_exc:
                            log.error(
                                "[Sync/live] AUTO-PICK FAIL match=%s: %s",
                                match.id, auto_exc,
                            )
                            errors.append(f"auto-pick {fx.external_id}: {auto_exc}")

                    if fx.status == "finished" and prev_status != "finished":
                        if fx.home_score is not None and fx.away_score is not None:
                            log.info(
                                "[Sync/live] AUTO-SCORE match=%s external=%s %d-%d "
                                "(transitioned %s → finished)",
                                match.id, fx.external_id,
                                fx.home_score, fx.away_score, prev_status,
                            )
                            try:
                                await do_score(match.id, fx.home_score, fx.away_score, db)
                            except Exception as score_exc:
                                log.error(
                                    "[Sync/live] SCORE-FAIL match=%s: %s",
                                    match.id, score_exc,
                                )
                                errors.append(f"scoring {fx.external_id}: {score_exc}")

                except Exception as exc:
                    errors.append(f"{fx.external_id}: {exc}")

            # ── Phase 2: stale-live recovery ──────────────────────
            # Find DB matches still marked 'live' that weren't in the live feed
            # and haven't been updated for 5+ minutes.  Catches HT dropouts
            # (API-Football stops listing matches in live=all during the break).
            stale_conds = [
                Match.status == "live",
                Match.updated_at <= _now - timedelta(minutes=5),
            ]
            if live_ext_ids_seen:
                stale_conds.append(Match.external_id.notin_(live_ext_ids_seen))

            stale_matches = (await db.execute(
                select(Match).where(*stale_conds)
            )).scalars().all()

            log.info("[Sync/live] Phase2 stale-live candidates: %d", len(stale_matches))
            for stale in stale_matches:
                if not stale.external_id or not stale.external_id.isdigit():
                    log.info(
                        "[Sync/live] Phase2 SKIP match=%s ext=%s — placeholder ID cannot be queried",
                        stale.id, stale.external_id,
                    )
                    continue
                try:
                    log.info(
                        "[Sync/live] Phase2 stale-live check match=%s external=%s",
                        stale.id, stale.external_id,
                    )
                    fx = await self.provider.fetch_by_id(stale.external_id)
                    _api_calls_today += 1
                    if not fx:
                        continue
                    await db.execute(
                        update(Match)
                        .where(Match.id == stale.id)
                        .values(
                            status          = fx.status,
                            home_score      = fx.home_score,
                            away_score      = fx.away_score,
                            penalty_home    = fx.penalty_home,
                            penalty_away    = fx.penalty_away,
                            period          = fx.period,
                            provider_status = fx.provider_status,
                            minute          = fx.minute,
                            sync_source     = "stale_live",
                            updated_at      = datetime.now(timezone.utc),
                        )
                        .execution_options(synchronize_session=False)
                    )
                    count += 1
                    if fx.status == "finished" and fx.home_score is not None \
                            and fx.away_score is not None:
                        log.info(
                            "[Sync/live] Phase2 AUTO-SCORE match=%s %d-%d",
                            stale.id, fx.home_score, fx.away_score,
                        )
                        try:
                            await do_score(stale.id, fx.home_score, fx.away_score, db)
                        except Exception as score_exc:
                            log.error(
                                "[Sync/live] Phase2 SCORE-FAIL match=%s: %s",
                                stale.id, score_exc,
                            )
                            errors.append(f"stale-live score {stale.external_id}: {score_exc}")
                except Exception as exc:
                    errors.append(f"stale-live {stale.external_id}: {exc}")

            # ── Phase 2.5: post-FT score verification ─────────────
            # Re-fetch matches that finished in the last 10 minutes to catch
            # VAR corrections or API-Football score adjustments after FT.
            post_ft_matches = (await db.execute(
                select(Match).where(
                    Match.status == "finished",
                    Match.updated_at >= _now - timedelta(minutes=10),
                    Match.external_id.isnot(None),
                )
            )).scalars().all()

            log.info("[Sync/live] Phase2.5 post-FT candidates: %d", len(post_ft_matches))
            for m in post_ft_matches:
                if not m.external_id or not m.external_id.isdigit():
                    continue
                if m.external_id in live_ext_ids_seen:
                    continue  # already refreshed in Phase 1
                try:
                    fx = await self.provider.fetch_by_id(m.external_id)
                    _api_calls_today += 1
                    if not fx:
                        continue
                    if fx.home_score == m.home_score and fx.away_score == m.away_score:
                        continue  # no change
                    log.info(
                        "[Sync/live] Phase2.5 POST-FT score correction match=%s %s-%s → %s-%s",
                        m.id, m.home_score, m.away_score, fx.home_score, fx.away_score,
                    )
                    await db.execute(
                        update(Match)
                        .where(Match.id == m.id)
                        .values(
                            home_score      = fx.home_score,
                            away_score      = fx.away_score,
                            penalty_home    = fx.penalty_home,
                            penalty_away    = fx.penalty_away,
                            provider_status = fx.provider_status,
                            sync_source     = "post_ft",
                            updated_at      = _now,
                        )
                        .execution_options(synchronize_session=False)
                    )
                    count += 1
                    # re-score with corrected final score
                    try:
                        await do_score(m.id, fx.home_score, fx.away_score, db)
                    except Exception as score_exc:
                        errors.append(f"post-ft score {m.external_id}: {score_exc}")
                except Exception as exc:
                    errors.append(f"post-ft {m.external_id}: {exc}")

            # ── Phase 3: stale-scheduled recovery ─────────────────
            # Matches that never transitioned scheduled → live because the live
            # feed (Phase 1) missed them.  Fetch each individually and update.
            stale_scheduled = (await db.execute(
                select(Match).where(
                    Match.status == "scheduled",
                    Match.scheduled_at <= _now - timedelta(minutes=5),
                    Match.external_id.isnot(None),
                )
            )).scalars().all()

            log.info("[Sync/live] Phase3 stale-scheduled candidates: %d", len(stale_scheduled))
            _phase3_reconcile_triggered = False
            for stale in stale_scheduled:
                if not stale.external_id or not stale.external_id.isdigit():
                    log.info(
                        "[Sync/live] Phase3 SKIP match=%s %sv%s ext=%s — placeholder ID; triggering reconcile",
                        stale.id,
                        getattr(stale, "home_team_code", "?"),
                        getattr(stale, "away_team_code", "?"),
                        stale.external_id,
                    )
                    if not _phase3_reconcile_triggered:
                        _phase3_reconcile_triggered = True
                        try:
                            _recon = await self.reconcile_knockout_slots(db)
                            log.info(
                                "[Sync/live] Phase3 reconcile triggered → status=%s records=%d",
                                _recon.status, _recon.records_affected,
                            )
                            if _recon.records_affected > 0:
                                count += _recon.records_affected
                            if _recon.errors:
                                errors.extend(_recon.errors)
                            _last_ko_reconcile_at = _now
                        except Exception as _recon_exc:
                            log.error("[Sync/live] Phase3 reconcile trigger FAIL: %s", _recon_exc)
                            errors.append(f"phase3-reconcile: {_recon_exc}")
                    continue
                try:
                    log.info(
                        "[Sync/live] Phase3 stale-scheduled check match=%s external=%s",
                        stale.id, stale.external_id,
                    )
                    fx = await self.provider.fetch_by_id(stale.external_id)
                    _api_calls_today += 1
                    if not fx:
                        continue
                    await db.execute(
                        update(Match)
                        .where(Match.id == stale.id)
                        .values(
                            status          = fx.status,
                            home_score      = fx.home_score,
                            away_score      = fx.away_score,
                            penalty_home    = fx.penalty_home,
                            penalty_away    = fx.penalty_away,
                            period          = fx.period,
                            provider_status = fx.provider_status,
                            minute          = fx.minute,
                            sync_source     = "stale_scheduled",
                            updated_at      = datetime.now(timezone.utc),
                        )
                        .execution_options(synchronize_session=False)
                    )
                    count += 1
                    if fx.status == "finished" and fx.home_score is not None \
                            and fx.away_score is not None:
                        log.info(
                            "[Sync/live] Phase3 AUTO-SCORE match=%s %d-%d",
                            stale.id, fx.home_score, fx.away_score,
                        )
                        try:
                            await do_score(stale.id, fx.home_score, fx.away_score, db)
                        except Exception as score_exc:
                            log.error(
                                "[Sync/live] Phase3 SCORE-FAIL match=%s: %s",
                                stale.id, score_exc,
                            )
                            errors.append(f"stale-sched score {stale.external_id}: {score_exc}")
                except Exception as exc:
                    errors.append(f"stale-sched {stale.external_id}: {exc}")

        # ── Phase 4: knockout slot reconciliation ─────────────────
        # Date-gated, throttled to once per hour, bypassed by Phase 3 trigger.
        _ko_due = (
            _now >= datetime(2026, 6, 26, 0, 0, tzinfo=timezone.utc)
            and (
                _last_ko_reconcile_at is None
                or _now >= _last_ko_reconcile_at + timedelta(hours=1)
            )
        )
        if _ko_due:
            ko_unreconciled = await db.scalar(
                select(Match.id).where(
                    Match.external_id.like("manual-wc2026-%"),
                    Match.round != "group",
                ).limit(1)
            )
            if ko_unreconciled:
                _last_ko_reconcile_at = _now
                try:
                    ko_result = await self.reconcile_knockout_slots(db)
                    if ko_result.records_affected > 0:
                        log.info(
                            "[Sync/live] Phase4 knockout reconcile: %d slots mapped",
                            ko_result.records_affected,
                        )
                        count += ko_result.records_affected
                    if ko_result.errors:
                        errors.extend(ko_result.errors)
                except Exception as ko_exc:
                    log.error("[Sync/live] Phase4 knockout reconcile FAILED: %s", ko_exc)
                    errors.append(f"ko-reconcile: {ko_exc}")

        # Update monitoring state
        _last_sync_at               = _now
        _last_sync_mode             = _run_mode
        _last_sync_records_affected = count
        _last_sync_errors           = list(errors)

        await db.commit()
        return await self._finish_log(_log_entry, count, "\n".join(errors) if errors else None, db)

    # ── set_groups_manual ─────────────────────────────────────────

    async def set_groups_manual(
        self, groups: dict[str, str], db: AsyncSession
    ) -> SyncResult:
        """
        Apply an explicit {SHORT_CODE: "A"} mapping — bypasses inference.
        Useful when the official FIFA group draw letters are known.
        """
        return await self.sync_groups(db, manual=groups)

    # ── Helpers ───────────────────────────────────────────────────

    async def _teams_by_ext_id(self, db: AsyncSession) -> dict[str, "Team"]:
        """Load all teams keyed by provider external_id."""
        teams = (await db.execute(select(Team))).scalars().all()
        return {
            t.external_ids.get(self.provider.provider_key, ""): t
            for t in teams
            if self.provider.provider_key in (t.external_ids or {})
        }

    async def _start_log(self, entity_type: str, db: AsyncSession) -> SyncLog:
        log.info("[Sync] START provider=%s entity=%s", self.provider.provider_key, entity_type)
        entry = SyncLog(
            id          = str(uuid.uuid4()),
            provider    = self.provider.provider_key,
            entity_type = entity_type,
            status      = "running",
            started_at  = datetime.now(timezone.utc),
        )
        db.add(entry)
        await db.flush()
        return entry

    async def _fail_log(
        self, entry: SyncLog, error: str, db: AsyncSession
    ) -> SyncResult:
        log.error(
            "[Sync] FAIL provider=%s entity=%s error=%s",
            self.provider.provider_key, entry.entity_type, error,
        )
        entry.status        = "error"
        entry.error_message = error
        entry.finished_at   = datetime.now(timezone.utc)
        await db.commit()
        return SyncResult(status="error", entity_type=entry.entity_type, errors=[error])

    async def _finish_log(
        self,
        entry: SyncLog,
        count: int,
        errors_str: Optional[str],
        db: AsyncSession,
    ) -> SyncResult:
        status = "partial" if errors_str else "success"
        if status == "partial":
            log.warning(
                "[Sync] PARTIAL provider=%s entity=%s records=%d errors: %s",
                self.provider.provider_key, entry.entity_type, count, errors_str,
            )
        else:
            log.info(
                "[Sync] OK provider=%s entity=%s records=%d",
                self.provider.provider_key, entry.entity_type, count,
            )
        entry.status           = status
        entry.records_affected = count
        entry.error_message    = errors_str
        entry.finished_at      = datetime.now(timezone.utc)
        await db.commit()
        return SyncResult(
            status           = status,
            entity_type      = entry.entity_type,
            records_affected = count,
            errors           = errors_str.split("\n") if errors_str else [],
        )
