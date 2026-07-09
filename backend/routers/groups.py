"""
Groups standings + bracket data.

Curation layer: always returns exactly 12 WC 2026 groups (A–L) in display
order, driven by core.wc2026_config as the authoritative structural source.

Official WC 2026 format:
  12 groups × 4 teams = 48 teams
  Top 2 per group qualify automatically (24 teams)
  Best 8 of 12 third-place teams also qualify (8 teams)
  → Round of 32 with 32 teams

What this guards against
------------------------
- Provider returning extra "groups" from qualification rounds or pre-tournament
  stages (only A-L single-letter groups are kept)
- Inconsistent group letter assignments from raw sync
  (config's CODE_TO_GROUP is used to override provider group letters for any
  teams that are pre-configured; falls back to DB group_name otherwise)
- Incomplete groups due to missing DB data
  (config provides up to 4 TBD slots per group; DB-known teams fill the slots)
- Pure TBD-vs-TBD fixture noise (filtered from the fixtures list)
- Duplicate fixtures from both manual seed and real provider
  (real provider data wins; manual seeds are suppressed when a real fixture
  for the same team appears in the same group)
"""
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.ordering import MATCH_ORDER_BY
from core.wc2026_config import CODE_TO_GROUP, GROUP_ORDER, GROUPS as CONFIG_GROUPS
from models.match import Match
from models.team import Team

router = APIRouter(prefix="/groups", tags=["groups"])

_VALID_GROUPS: frozenset[str] = frozenset(GROUP_ORDER)   # A–L only

# Qualification thresholds (WC 2026 rules)
_AUTO_QUALIFY_RANK    = 2  # top 2 per group → guaranteed R32 spot
_POSSIBLE_QUALIFY_RANK = 3  # 3rd place → may qualify as one of best 8 third-place teams


# ── Output shapes ─────────────────────────────────────────────

class TeamStanding(BaseModel):
    id:           str
    name:         str
    shortCode:    str
    flagUrl:      Optional[str]
    logoUrl:      Optional[str]
    played:       int
    won:          int
    drawn:        int
    lost:         int
    goalsFor:     int
    goalsAgainst: int
    goalDiff:     int
    points:       int
    isTbd:            bool = False   # True for unconfirmed/placeholder team slots
    possiblyQualified: bool = False  # True for 3rd-place teams (best-8 rule)


class GroupFixture(BaseModel):
    id:          str
    homeCode:    str
    awayCode:    str
    homeName:    str
    awayName:    str
    homeFlag:    Optional[str]
    awayFlag:    Optional[str]
    scheduledAt: str
    status:      str
    homeScore:   Optional[int]
    awayScore:   Optional[int]


class GroupStandings(BaseModel):
    group:          str
    teams:          list[TeamStanding]
    matches:        list[GroupFixture]
    hasUnknownTeams: bool = False   # True when ≥1 team slot is still TBD


class BracketSlot(BaseModel):
    code:     Optional[str] = None
    name:     Optional[str] = None
    flagUrl:  Optional[str] = None
    score:    Optional[int] = None
    isWinner: bool = False


class BracketEntry(BaseModel):
    id:          str
    label:       Optional[str]
    round:       str
    homeSlot:    BracketSlot
    awaySlot:    BracketSlot
    status:      str
    scheduledAt: Optional[str]


# ── Helpers ───────────────────────────────────────────────────

def _blank(
    team_id: str,
    name: str,
    short_code: str,
    flag_url: Optional[str],
    logo_url: Optional[str],
    is_tbd: bool = False,
) -> TeamStanding:
    return TeamStanding(
        id=team_id, name=name, shortCode=short_code,
        flagUrl=flag_url, logoUrl=logo_url,
        played=0, won=0, drawn=0, lost=0,
        goalsFor=0, goalsAgainst=0, goalDiff=0, points=0,
        isTbd=is_tbd,
    )


def _sort_key(s: TeamStanding) -> tuple:
    # TBD slots always last; real teams sorted by Pts → GD → GF → Name
    if s.isTbd:
        return (1, 0, 0, 0, "")
    return (0, -s.points, -s.goalDiff, -s.goalsFor, s.name)


def _group_for_match(m: Match) -> Optional[str]:
    """
    Map a match to its WC 2026 config group.
    Prefers the CODE_TO_GROUP lookup (authoritative) over the DB's group_name
    field (which can be wrong after a raw provider sync).
    """
    home = m.home_team_code.upper()
    away = m.away_team_code.upper()

    if home != "TBD" and home in CODE_TO_GROUP:
        return CODE_TO_GROUP[home]
    if away != "TBD" and away in CODE_TO_GROUP:
        return CODE_TO_GROUP[away]

    # Fall back to DB's group_name only if it's a valid single-letter group
    db_group = (m.group_name or "").strip().upper()
    if len(db_group) == 1 and db_group in _VALID_GROUPS:
        return db_group

    return None


def _is_manual_seed(m: Match) -> bool:
    return bool(m.external_id and m.external_id.startswith("manual-wc2026-"))


# ── Routes ────────────────────────────────────────────────────

@router.get("/standings", response_model=list[GroupStandings])
async def group_standings(db: AsyncSession = Depends(get_db)) -> list[GroupStandings]:
    """
    Returns exactly 12 WC 2026 groups in order A–L (official FIFA format).

    Structure comes from the config (up to 4 team slots per group).
    Standings statistics come from finished matches in the DB.
    Unknown teams remain as TBD placeholders until provider data arrives.

    Qualification flags on TeamStanding:
      isTbd = True             → placeholder slot, not a real team
      possiblyQualified = True → 3rd-place team (may qualify as best-8 third-place)
      rank ≤ 2 and not isTbd  → automatically qualifies for R32
    """
    # All group-stage matches that are real data (exclude bare test rows)
    all_matches = (
        await db.execute(
            select(Match)
            .where(Match.round == "group", Match.external_id.is_not(None))
            .order_by(*MATCH_ORDER_BY)
        )
    ).scalars().all()

    # DB teams for canonical flag/logo/name enrichment
    db_teams = (await db.execute(select(Team))).scalars().all()
    team_by_code: dict[str, Team] = {t.short_code.upper(): t for t in db_teams}

    # ── Accumulate standings by team code (from finished matches) ─
    standings_by_code: dict[str, TeamStanding] = {}

    for m in all_matches:
        if m.status != "finished" or m.home_score is None or m.away_score is None:
            continue
        hs, as_ = m.home_score, m.away_score
        for is_home, code, name, flag in [
            (True,  m.home_team_code.upper(), m.home_team_name, m.home_flag_url),
            (False, m.away_team_code.upper(), m.away_team_name, m.away_flag_url),
        ]:
            if code == "TBD":
                continue
            if code not in standings_by_code:
                db_t = team_by_code.get(code)
                standings_by_code[code] = _blank(
                    db_t.id if db_t else code.lower(),
                    db_t.name if db_t else name,
                    code,
                    db_t.flag_url if db_t else flag,
                    db_t.logo_url if db_t else None,
                )
            row = standings_by_code[code]
            gf = hs if is_home else as_
            ga = as_ if is_home else hs
            row.played       += 1
            row.goalsFor     += gf
            row.goalsAgainst += ga
            row.goalDiff      = row.goalsFor - row.goalsAgainst
            if gf > ga:
                row.won    += 1; row.points += 3
            elif gf == ga:
                row.drawn  += 1; row.points += 1
            else:
                row.lost   += 1

    # ── Build fixture lists per group ─────────────────────────────
    # Two-pass: real provider fixtures first, then manual seeds.
    # A manual seed is suppressed when a real fixture for any of its known
    # (non-TBD) teams already exists in the same group.
    real_fixtures: dict[str, list[GroupFixture]]   = defaultdict(list)
    manual_fixtures: dict[str, list[GroupFixture]] = defaultdict(list)

    for m in all_matches:
        grp = _group_for_match(m)
        if not grp:
            continue
        home_code = m.home_team_code.upper()
        away_code = m.away_team_code.upper()
        if home_code == "TBD" and away_code == "TBD":
            continue

        fx = GroupFixture(
            id          = m.id,
            homeCode    = home_code,
            awayCode    = away_code,
            homeName    = m.home_team_name,
            awayName    = m.away_team_name,
            homeFlag    = m.home_flag_url,
            awayFlag    = m.away_flag_url,
            scheduledAt = m.scheduled_at.isoformat(),
            status      = m.status,
            homeScore   = m.home_score,
            awayScore   = m.away_score,
        )
        if _is_manual_seed(m):
            manual_fixtures[grp].append(fx)
        else:
            real_fixtures[grp].append(fx)

    # Merge: add manual seed only if it introduces a team pair not covered
    # by any real fixture already in the same group.
    group_fixtures: dict[str, list[GroupFixture]] = {
        g: list(fxs) for g, fxs in real_fixtures.items()
    }
    for grp, manual_fxs in manual_fixtures.items():
        real_codes: set[str] = {
            code
            for fx in group_fixtures.get(grp, [])
            for code in (fx.homeCode, fx.awayCode)
            if code != "TBD"
        }
        for fx in manual_fxs:
            known_codes = {c for c in (fx.homeCode, fx.awayCode) if c != "TBD"}
            # Skip this manual fixture if all its known teams are already
            # covered by a real provider fixture in this group.
            if known_codes and known_codes.issubset(real_codes):
                continue
            group_fixtures.setdefault(grp, []).append(fx)
            real_codes |= known_codes

    # ── Assemble 12-group output in config order (A–L) ───────────
    result: list[GroupStandings] = []
    for g in GROUP_ORDER:
        config_slots = CONFIG_GROUPS[g]  # up to 4 slots (all TBD until draw data arrives)
        config_known: set[str] = {code for (code, _, _) in config_slots if code != "TBD"}

        # Collect all teams the provider knows for this group (from fixtures).
        # These fill the TBD slots in the config.
        provider_codes: list[str] = []
        seen_p: set[str] = set()
        for fx in group_fixtures.get(g, []):
            for code in (fx.homeCode, fx.awayCode):
                if code != "TBD" and code not in config_known and code not in seen_p:
                    provider_codes.append(code)
                    seen_p.add(code)
        extra_iter = iter(provider_codes)

        team_slots: list[TeamStanding] = []
        has_tbd = False

        for (cfg_code, cfg_name, cfg_flag) in config_slots:
            if cfg_code != "TBD":
                # Pre-configured team (from official draw data in config)
                db_t = team_by_code.get(cfg_code)
                if cfg_code in standings_by_code:
                    s = standings_by_code[cfg_code]
                    if db_t and not s.flagUrl:
                        s.flagUrl = db_t.flag_url or cfg_flag
                    elif not s.flagUrl:
                        s.flagUrl = cfg_flag
                    team_slots.append(s)
                else:
                    team_slots.append(_blank(
                        db_t.id if db_t else cfg_code.lower(),
                        db_t.name if db_t else cfg_name,
                        cfg_code,
                        db_t.flag_url if db_t else cfg_flag,
                        db_t.logo_url if db_t else None,
                    ))
            else:
                # TBD slot — try to fill from provider fixture data
                extra = next(extra_iter, None)
                if extra:
                    db_t = team_by_code.get(extra)
                    if extra in standings_by_code:
                        team_slots.append(standings_by_code[extra])
                    else:
                        team_slots.append(_blank(
                            db_t.id if db_t else extra.lower(),
                            db_t.name if db_t else extra,
                            extra,
                            db_t.flag_url if db_t else None,
                            db_t.logo_url if db_t else None,
                        ))
                else:
                    has_tbd = True
                    team_slots.append(_blank("tbd", "TBD", "TBD", None, None, is_tbd=True))

        team_slots.sort(key=_sort_key)

        # Mark 3rd-place teams as possibly qualified (best-8-third-place rule)
        real_teams = [t for t in team_slots if not t.isTbd]
        for i, t in enumerate(team_slots):
            if not t.isTbd and i + 1 == _POSSIBLE_QUALIFY_RANK and len(real_teams) >= _POSSIBLE_QUALIFY_RANK:
                t.possiblyQualified = True

        # Sort fixtures by kickoff time
        sorted_fxs = sorted(group_fixtures.get(g, []), key=lambda f: f.scheduledAt)

        result.append(GroupStandings(
            group           = g,
            teams           = team_slots,
            matches         = sorted_fxs,
            hasUnknownTeams = has_tbd,
        ))

    return result


@router.get("/bracket", response_model=list[BracketEntry])
async def bracket(db: AsyncSession = Depends(get_db)) -> list[BracketEntry]:
    """Knockout stage matches (r32 → final), sorted by scheduledAt."""
    matches = (
        await db.execute(
            select(Match)
            .where(Match.round.in_(["r32", "r16", "qf", "sf", "3rd", "final"]))
            .order_by(*MATCH_ORDER_BY)
        )
    ).scalars().all()

    result: list[BracketEntry] = []
    for m in matches:
        hs, as_ = m.home_score, m.away_score
        home_wins = hs is not None and as_ is not None and hs > as_
        away_wins = hs is not None and as_ is not None and as_ > hs

        # Derive a human-readable label from manual seed external IDs
        label: Optional[str] = None
        home_name = m.home_team_name or None
        away_name = m.away_team_name or None

        # For TBD placeholder matches, use the seed's label embedded in the name
        if m.home_team_code == "TBD" and home_name and home_name != "TBD":
            label = home_name  # e.g. "1st Group A"

        result.append(BracketEntry(
            id    = m.id,
            label = label,
            round = m.round,
            homeSlot = BracketSlot(
                code     = m.home_team_code if m.home_team_code != "TBD" else None,
                name     = home_name if m.home_team_code != "TBD" else None,
                flagUrl  = m.home_flag_url,
                score    = hs,
                isWinner = home_wins,
            ),
            awaySlot = BracketSlot(
                code     = m.away_team_code if m.away_team_code != "TBD" else None,
                name     = away_name if m.away_team_code != "TBD" else None,
                flagUrl  = m.away_flag_url,
                score    = as_,
                isWinner = away_wins,
            ),
            status      = m.status,
            scheduledAt = m.scheduled_at.isoformat() if m.scheduled_at else None,
        ))

    return result
