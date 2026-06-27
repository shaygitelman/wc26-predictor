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

from sqlalchemy import func, select, update
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

# Throttle: only run knockout slot reconciliation at most once per hour from sync_live.
# The bootstrap and admin/cron endpoints bypass this and always run to completion.
_last_ko_reconcile_at: Optional[datetime] = None


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
                group_name   = home_group or away_group  # same group for both teams

                round_code   = _ROUND_MAP.get(fx.int_round, "group")

                # Provider may supply group letter directly (API-Football does)
                if fx.group_name:
                    group_name = fx.group_name
                    if not home_group:
                        home_group = group_name
                    if not away_group:
                        away_group = group_name

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
                        "round":          round_code,
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

        # ── Phase A: bracket propagation (DB-internal, no API call required) ───
        # As each previous-round match finishes, propagate the winner (or loser for
        # 3rd-place) into the corresponding next-round placeholder slot.  Phase B
        # (below) then enriches those slots with the real external ID and metadata
        # once the API publishes confirmed fixtures.
        from services.wc2026_seed import _BRACKET_FEEDERS, _PREV_ROUND

        for _nr, _feeders in _BRACKET_FEEDERS.items():
            _pr         = _PREV_ROUND[_nr]
            _use_losers = (_nr == "3rd")

            # Previous-round matches in slot order (ascending scheduled_at; ties
            # broken by external_id string so manual-wc2026-*-1 < *-2 etc.)
            _prev_all = sorted(
                (await db.execute(select(Match).where(Match.round == _pr))).scalars().all(),
                key=lambda m: (
                    m.scheduled_at or datetime.min.replace(tzinfo=timezone.utc),
                    m.external_id or "",
                ),
            )

            # Next-round placeholders that still need teams assigned
            _next_phs: dict[int, Match] = {
                _slot_num(m.external_id or ""): m
                for m in (await db.execute(
                    select(Match).where(
                        Match.round == _nr,
                        Match.external_id.like("manual-wc2026-%"),
                    )
                )).scalars().all()
                if (m.home_team_code or "TBD") in ("TBD", "", None)
                   or (m.away_team_code or "TBD") in ("TBD", "", None)
            }
            if not _next_phs:
                continue

            for _si, (_hs, _as) in enumerate(_feeders, start=1):
                _ph = _next_phs.get(_si)
                if not _ph or _hs > len(_prev_all) or _as > len(_prev_all):
                    continue
                _hm, _am = _prev_all[_hs - 1], _prev_all[_as - 1]
                if _hm.status != "finished" or _am.status != "finished":
                    continue

                def _outcome(m: Match, want_winner: bool):
                    if (m.home_score is None or m.away_score is None
                            or m.home_score == m.away_score):
                        return None  # tied score — ET/PK winner unknown; wait for API
                    use_home = (m.home_score > m.away_score) == want_winner
                    return (
                        (m.home_team_code, m.home_team_name, m.home_flag_url)
                        if use_home else
                        (m.away_team_code, m.away_team_name, m.away_flag_url)
                    )

                _h_info = _outcome(_hm, not _use_losers)
                _a_info = _outcome(_am, not _use_losers)
                if not _h_info or not _a_info:
                    continue

                _h_code, _h_name, _h_flag = _h_info
                _a_code, _a_name, _a_flag = _a_info
                _pv: dict = {
                    "home_team_code": _h_code, "home_team_name": _h_name,
                    "away_team_code": _a_code, "away_team_name": _a_name,
                    "updated_at":     _now,
                }
                if _h_flag:
                    _pv["home_flag_url"] = _h_flag
                if _a_flag:
                    _pv["away_flag_url"] = _a_flag

                await db.execute(
                    update(Match).where(Match.id == _ph.id)
                    .values(**_pv)
                    .execution_options(synchronize_session=False)
                )
                count += 1
                log.info(
                    "[Sync/reconcile_knockout] bracket-prop %s slot=%d: %s vs %s",
                    _nr, _si, _h_code, _a_code,
                )

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
                            if not ph:
                                if fx.external_id not in _reconciled_ext:
                                    errors.append(
                                        f"r32 {fx.external_id}: no placeholder for ({h_lbl}, {a_lbl})"
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
                            vals["status"]     = fx.status
                            vals["home_score"] = fx.home_score
                            vals["away_score"] = fx.away_score

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
                continue  # r32 done — move to next round

            # Progressive matching for R16 and later — no count-equality gate.
            # API fixtures and DB placeholders are both in chronological (slot) order.
            # Skip already-reconciled API fixtures; fill unreconciled DB slots in sequence.
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

            _upd_rnd: set[str] = set()
            _ph_iter = iter(db_placeholders)

            for fx in api_fixtures:
                try:
                    if fx.external_id in _rec_rnd:
                        continue

                    ph = next(_ph_iter, None)
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
                        values["status"]     = fx.status
                        values["home_score"] = fx.home_score
                        values["away_score"] = fx.away_score

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
        from datetime import timedelta

        from core.scorer import score_match as do_score
        from services.auto_pick import generate_auto_picks

        # Skip external API call when no matches are live or starting within 5 minutes.
        # Keeps API-Football call count well within plan limits during non-match windows.
        _now = datetime.now(timezone.utc)
        has_active = await db.scalar(
            select(Match.id).where(
                (Match.status == "live")
                | (
                    (Match.status == "scheduled")
                    & (Match.scheduled_at <= _now + timedelta(minutes=5))
                )
            ).limit(1)
        )
        if not has_active:
            log.debug("[Sync/live] skip — no live or imminent matches in DB")
            return SyncResult(status="skipped", entity_type="live", records_affected=0)

        _log_entry = await self._start_log("live", db)

        try:
            fixtures = await self.provider.fetch_live(self.league_id)
        except Exception as exc:
            return await self._fail_log(_log_entry, str(exc), db)

        count  = 0
        errors: list[str] = []

        # Track external IDs seen in the live feed so we can detect
        # matches that dropped off (likely just finished).
        live_ext_ids_seen: set[str] = set()

        for fx in fixtures:
            try:
                match = await db.scalar(
                    select(Match).where(Match.external_id == fx.external_id)
                )
                if not match:
                    continue  # unknown fixture; skip

                live_ext_ids_seen.add(fx.external_id)
                prev_status = match.status

                await db.execute(
                    update(Match)
                    .where(Match.id == match.id)
                    .values(
                        status     = fx.status,
                        home_score = fx.home_score,
                        away_score = fx.away_score,
                        minute     = fx.minute,
                        updated_at = datetime.now(timezone.utc),
                    )
                    .execution_options(synchronize_session=False)
                )
                count += 1

                # Generate auto-picks when a match goes live (60-second buffer after kick-off)
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

                # Award points when a match just finished
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

        # ── Phase 2: stale-live recovery ──────────────────────────
        # Find DB matches still marked 'live' that weren't in the live feed
        # and are old enough to have finished.  Fetch each individually to
        # get their real final status.  This covers the window between
        # a match finishing and the next sync_live tick.
        # 95 min = 90-min match + 5-min buffer; safe for extra-time matches
        # because we re-check real status before acting (won't false-finish).
        stale_conds = [
            Match.status == "live",
            Match.scheduled_at <= _now - timedelta(minutes=95),
        ]
        if live_ext_ids_seen:
            stale_conds.append(Match.external_id.notin_(live_ext_ids_seen))

        stale_matches = (await db.execute(
            select(Match).where(*stale_conds)
        )).scalars().all()

        for stale in stale_matches:
            if not stale.external_id or not stale.external_id.isdigit():
                continue  # manual/placeholder IDs cannot be queried from API
            try:
                log.info(
                    "[Sync/live] stale-live check match=%s external=%s",
                    stale.id, stale.external_id,
                )
                fx = await self.provider.fetch_by_id(stale.external_id)
                if not fx:
                    continue
                await db.execute(
                    update(Match)
                    .where(Match.id == stale.id)
                    .values(
                        status     = fx.status,
                        home_score = fx.home_score,
                        away_score = fx.away_score,
                        minute     = fx.minute,
                        updated_at = datetime.now(timezone.utc),
                    )
                    .execution_options(synchronize_session=False)
                )
                count += 1
                if fx.status == "finished" and fx.home_score is not None \
                        and fx.away_score is not None:
                    log.info(
                        "[Sync/live] stale-live AUTO-SCORE match=%s %d-%d",
                        stale.id, fx.home_score, fx.away_score,
                    )
                    try:
                        await do_score(stale.id, fx.home_score, fx.away_score, db)
                    except Exception as score_exc:
                        log.error(
                            "[Sync/live] stale-live SCORE-FAIL match=%s: %s",
                            stale.id, score_exc,
                        )
                        errors.append(f"stale-live score {stale.external_id}: {score_exc}")
            except Exception as exc:
                errors.append(f"stale-live {stale.external_id}: {exc}")

        # ── Phase 3: stale-scheduled recovery ─────────────────────────
        # Matches that never transitioned scheduled → live because the live
        # feed (Phase 1) missed them.  Fetch each individually and update.
        # Threshold is 5 minutes: short enough to catch a missed kick-off
        # quickly (within one cron tick) but long enough to avoid
        # false-positives for late-starting matches.
        stale_scheduled = (await db.execute(
            select(Match).where(
                Match.status == "scheduled",
                Match.scheduled_at <= _now - timedelta(minutes=5),
                Match.external_id.isnot(None),
            )
        )).scalars().all()

        for stale in stale_scheduled:
            if not stale.external_id or not stale.external_id.isdigit():
                continue
            try:
                log.info(
                    "[Sync/live] stale-scheduled check match=%s external=%s",
                    stale.id, stale.external_id,
                )
                fx = await self.provider.fetch_by_id(stale.external_id)
                if not fx:
                    continue
                prev_status = stale.status
                await db.execute(
                    update(Match)
                    .where(Match.id == stale.id)
                    .values(
                        status     = fx.status,
                        home_score = fx.home_score,
                        away_score = fx.away_score,
                        minute     = fx.minute,
                        updated_at = datetime.now(timezone.utc),
                    )
                    .execution_options(synchronize_session=False)
                )
                count += 1
                if fx.status == "finished" and fx.home_score is not None \
                        and fx.away_score is not None:
                    log.info(
                        "[Sync/live] stale-scheduled AUTO-SCORE match=%s %d-%d",
                        stale.id, fx.home_score, fx.away_score,
                    )
                    try:
                        await do_score(stale.id, fx.home_score, fx.away_score, db)
                    except Exception as score_exc:
                        log.error(
                            "[Sync/live] stale-scheduled SCORE-FAIL match=%s: %s",
                            stale.id, score_exc,
                        )
                        errors.append(f"stale-sched score {stale.external_id}: {score_exc}")
            except Exception as exc:
                errors.append(f"stale-sched {stale.external_id}: {exc}")

        # ── Phase 4: knockout slot reconciliation ─────────────────────
        # Once the group stage ends, API-Football publishes knockout fixtures
        # with real team codes.  Auto-reconcile placeholder rows so live sync
        # can find them by numeric external_id.
        # Date-gated (July 1+), throttled to once per hour, and fast-exits
        # if no manual KO placeholders remain.
        global _last_ko_reconcile_at
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
