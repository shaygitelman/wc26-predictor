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
                        existing.team_id       = team.id
                        existing.name          = p.name
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

        log = await self._start_log("live", db)

        try:
            fixtures = await self.provider.fetch_live(self.league_id)
        except Exception as exc:
            return await self._fail_log(log, str(exc), db)

        count  = 0
        errors: list[str] = []

        for fx in fixtures:
            try:
                match = await db.scalar(
                    select(Match).where(Match.external_id == fx.external_id)
                )
                if not match:
                    continue  # unknown fixture; skip

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

        await db.commit()
        return await self._finish_log(log, count, "\n".join(errors) if errors else None, db)

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
