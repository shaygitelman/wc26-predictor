"""
Abstract provider interface. Implement this to add any data source
(TheSportsDB, API-Football, live stats APIs, etc.) without changing
the sync service or any other backend code.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ProviderTeam:
    external_id:  str
    name:         str
    short_code:   str              # 3-letter FIFA code: 'BRA'
    flag_url:     Optional[str] = None
    logo_url:     Optional[str] = None
    group_name:   Optional[str] = None
    country_code: Optional[str] = None   # ISO 3166-1 alpha-2: 'br'


@dataclass
class ProviderPlayer:
    external_id:      str
    team_external_id: str
    name:             str
    position:         Optional[str] = None    # GK|DEF|MID|FWD
    shirt_number:     Optional[int] = None
    photo_url:        Optional[str] = None
    date_of_birth:    Optional[str] = None    # 'YYYY-MM-DD'


@dataclass
class ProviderFixture:
    external_id:      str
    home_external_id: str            # provider's team ID (used for team lookup)
    away_external_id: str
    home_team_code:   str            # uppercase FIFA code: 'BRA'
    away_team_code:   str
    home_team_name:   str
    away_team_name:   str
    scheduled_at:     datetime       # UTC
    int_round:        int = 1
    home_flag_url:    Optional[str] = None
    away_flag_url:    Optional[str] = None
    home_logo_url:    Optional[str] = None
    away_logo_url:    Optional[str] = None
    venue:            Optional[str] = None
    city:             Optional[str] = None
    status:           str = 'scheduled'      # scheduled|live|finished
    home_score:       Optional[int] = None
    away_score:       Optional[int] = None
    penalty_home:     Optional[int] = None   # penalty shootout goals (None if not applicable)
    penalty_away:     Optional[int] = None
    period:           Optional[str] = None   # raw live period: "1H"|"HT"|"2H"|"ET"|"P" (None when not live)
    thumb_url:        Optional[str] = None   # match thumbnail / poster
    group_name:       Optional[str] = None   # group letter if provider exposes it ('A'–'L')
    minute:           Optional[int] = None   # live match minute


class FootballDataProvider(ABC):
    """
    All provider implementations must have a `provider_key` class attribute.
    This key is used as the field name inside `external_ids` JSONB columns,
    e.g. {"thesportsdb": "134497"}.
    """
    provider_key: str

    @abstractmethod
    async def fetch_teams(self, league_id: str) -> list[ProviderTeam]:
        """Return all teams competing in the given league."""

    @abstractmethod
    async def fetch_fixtures(self, league_id: str, season: str) -> list[ProviderFixture]:
        """Return all fixtures for a league-season."""

    @abstractmethod
    async def fetch_players(self, team_external_id: str) -> list[ProviderPlayer]:
        """Return all players in a team's squad."""

    async def fetch_standings(self, league_id: str, season: str) -> dict[str, str]:
        """Return {team_external_id: group_letter}. Default: not supported."""
        return {}

    async def fetch_live(self, league_id: str) -> list["ProviderFixture"]:
        """Return live fixtures. Default: not supported."""
        return []

    async def fetch_by_id(self, fixture_id: str) -> Optional["ProviderFixture"]:
        """Return a single fixture by provider ID. Default: not supported."""
        return None
