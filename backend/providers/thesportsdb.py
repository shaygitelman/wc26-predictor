"""
TheSportsDB provider (free tier, API key "3").

API reference: https://www.thesportsdb.com/api.php
WC 2026 league ID: 4429
Season format:     "2026"
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx

from providers.base import FootballDataProvider, ProviderFixture, ProviderPlayer, ProviderTeam

BASE_URL = "https://www.thesportsdb.com/api/v1/json/3"

# ── Round mapping ─────────────────────────────────────────────────
# TheSportsDB intRound for WC 2026 (48-team format):
#   1-3  = group stage matchdays
#   4    = round of 32
#   5    = round of 16
#   6    = quarter-finals
#   7    = semi-finals
#   8    = third-place match
#   9    = final
# Adjust this map if live data shows different numbering.
_ROUND_MAP: dict[int, str] = {
    1: "group", 2: "group", 3: "group",
    4: "r32",
    5: "r16",
    6: "qf",
    7: "sf",
    8: "3rd",
    9: "final",
}

# ── Status mapping ────────────────────────────────────────────────
_STATUS_MAP: dict[str, str] = {
    "Not Started":      "scheduled",
    "Match Finished":   "finished",
    "After Extra Time": "finished",
    "After Penalties":  "finished",
    "In Progress":      "live",
    "1H":               "live",
    "2H":               "live",
    "ET":               "live",
    "P":                "live",
    "HT":               "live",
    "Postponed":        "scheduled",
    "Cancelled":        "scheduled",
    "Suspended":        "scheduled",
}

# ── FIFA team code + ISO country code lookup ──────────────────────
# Maps TheSportsDB full team name → (FIFA_code, iso_alpha2).
# Covers all likely 48 WC 2026 participants.
_TEAM_META: dict[str, tuple[str, str]] = {
    # CONCACAF
    "Mexico":                 ("MEX", "mx"),
    "United States":          ("USA", "us"),
    "USA":                    ("USA", "us"),
    "Canada":                 ("CAN", "ca"),
    "Honduras":               ("HON", "hn"),
    "Panama":                 ("PAN", "pa"),
    "Jamaica":                ("JAM", "jm"),
    "Costa Rica":             ("CRC", "cr"),
    "El Salvador":            ("SLV", "sv"),
    "Trinidad and Tobago":    ("TRI", "tt"),
    "Cuba":                   ("CUB", "cu"),
    # CONMEBOL
    "Brazil":                 ("BRA", "br"),
    "Argentina":              ("ARG", "ar"),
    "Uruguay":                ("URU", "uy"),
    "Colombia":               ("COL", "co"),
    "Ecuador":                ("ECU", "ec"),
    "Venezuela":              ("VEN", "ve"),
    "Chile":                  ("CHI", "cl"),
    "Paraguay":               ("PAR", "py"),
    "Peru":                   ("PER", "pe"),
    "Bolivia":                ("BOL", "bo"),
    # UEFA
    "France":                 ("FRA", "fr"),
    "Germany":                ("GER", "de"),
    "Spain":                  ("ESP", "es"),
    "England":                ("ENG", "gb"),
    "Portugal":               ("POR", "pt"),
    "Netherlands":            ("NED", "nl"),
    "Italy":                  ("ITA", "it"),
    "Belgium":                ("BEL", "be"),
    "Croatia":                ("CRO", "hr"),
    "Switzerland":            ("SUI", "ch"),
    "Austria":                ("AUT", "at"),
    "Serbia":                 ("SRB", "rs"),
    "Slovakia":               ("SVK", "sk"),
    "Ukraine":                ("UKR", "ua"),
    "Denmark":                ("DEN", "dk"),
    "Norway":                 ("NOR", "no"),
    "Sweden":                 ("SWE", "se"),
    "Poland":                 ("POL", "pl"),
    "Hungary":                ("HUN", "hu"),
    "Wales":                  ("WAL", "gb"),
    "Scotland":               ("SCO", "gb"),
    "Czech Republic":         ("CZE", "cz"),
    "Czechia":                ("CZE", "cz"),
    "Bosnia-Herzegovina":     ("BIH", "ba"),
    "Romania":                ("ROU", "ro"),
    "Greece":                 ("GRE", "gr"),
    "Albania":                ("ALB", "al"),
    "Iceland":                ("ISL", "is"),
    "Turkey":                 ("TUR", "tr"),
    # CAF
    "Morocco":                ("MAR", "ma"),
    "Senegal":                ("SEN", "sn"),
    "Egypt":                  ("EGY", "eg"),
    "Nigeria":                ("NGA", "ng"),
    "Cameroon":               ("CMR", "cm"),
    "South Africa":           ("RSA", "za"),
    "Ghana":                  ("GHA", "gh"),
    "Ivory Coast":            ("CIV", "ci"),
    "Côte d'Ivoire":          ("CIV", "ci"),
    "Tunisia":                ("TUN", "tn"),
    "Algeria":                ("ALG", "dz"),
    "Mali":                   ("MLI", "ml"),
    "Democratic Republic of Congo": ("COD", "cd"),
    "DR Congo":               ("COD", "cd"),
    "Zambia":                 ("ZAM", "zm"),
    "Tanzania":               ("TAN", "tz"),
    # AFC
    "Japan":                  ("JPN", "jp"),
    "South Korea":            ("KOR", "kr"),
    "Australia":              ("AUS", "au"),
    "Iran":                   ("IRN", "ir"),
    "Saudi Arabia":           ("KSA", "sa"),
    "Qatar":                  ("QAT", "qa"),
    "Uzbekistan":             ("UZB", "uz"),
    "Jordan":                 ("JOR", "jo"),
    "Indonesia":              ("IDN", "id"),
    "Iraq":                   ("IRQ", "iq"),
    "Oman":                   ("OMA", "om"),
    "Bahrain":                ("BHR", "bh"),
    "Palestine":              ("PLE", "ps"),
    # OFC
    "New Zealand":            ("NZL", "nz"),
}


class TheSportsDBProvider(FootballDataProvider):
    provider_key = "thesportsdb"

    def __init__(self, api_key: str = "3", timeout: float = 20.0):
        self._api_key = api_key
        self._timeout = timeout

    # ── Teams ─────────────────────────────────────────────────────

    async def fetch_teams(self, league_id: str) -> list[ProviderTeam]:
        """
        TheSportsDB's lookup_all_teams endpoint uses club-football league IDs,
        which don't map to national-team tournaments. Instead we:
          1. Fetch the season events to discover all participating teams.
          2. De-duplicate by idHomeTeam / idAwayTeam.
          3. Do one individual lookupteam.php call per team for badge/logo.
        """
        # Step 1: get all fixtures for the season
        fixtures = await self.fetch_fixtures(league_id, self._season)

        # Step 2: collect unique (ext_id → name) pairs
        seen: dict[str, str] = {}  # ext_id → team_name
        for fx in fixtures:
            if fx.home_external_id and fx.home_external_id not in seen:
                seen[fx.home_external_id] = fx.home_team_name
            if fx.away_external_id and fx.away_external_id not in seen:
                seen[fx.away_external_id] = fx.away_team_name

        # Step 3: individual lookups for badge/logo + strTeamShort
        result: list[ProviderTeam] = []
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            for ext_id, name in seen.items():
                await asyncio.sleep(0.25)   # respect free-tier rate limit
                logo_url: Optional[str] = None
                short_from_api: Optional[str] = None
                try:
                    r = await client.get(
                        f"{BASE_URL}/lookupteam.php", params={"id": ext_id}
                    )
                    if r.is_success:
                        teams_data = r.json().get("teams") or []
                        if teams_data:
                            t = teams_data[0]
                            logo_url       = t.get("strBadge") or t.get("strLogo") or None
                            short_from_api = (t.get("strTeamShort") or "").strip().upper() or None
                except Exception:
                    pass  # logo/short_code enrichment is best-effort

                meta         = _TEAM_META.get(name, (name[:3].upper(), None))
                short_code   = (short_from_api if short_from_api and len(short_from_api) <= 4
                                else meta[0])
                country_code = meta[1]

                result.append(ProviderTeam(
                    external_id  = ext_id,
                    name         = name,
                    short_code   = short_code,
                    flag_url     = _flag_url(country_code),
                    logo_url     = logo_url,
                    country_code = country_code,
                ))

        return result

    @property
    def _season(self) -> str:
        """Season string used by this provider for WC 2026."""
        return "2026"

    # ── Fixtures ──────────────────────────────────────────────────

    async def fetch_fixtures(self, league_id: str, season: str) -> list[ProviderFixture]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{BASE_URL}/eventsseason.php",
                params={"id": league_id, "s": season},
            )
            resp.raise_for_status()
            data = resp.json()

        raw_events: list[dict] = data.get("events") or []
        result: list[ProviderFixture] = []

        for e in raw_events:
            if not e.get("idEvent"):
                continue

            scheduled_at = _parse_timestamp(
                e.get("strTimestamp") or e.get("dateEvent") or ""
            )
            if scheduled_at is None:
                continue

            int_round = _safe_int(e.get("intRound"), 1)
            status    = _STATUS_MAP.get(e.get("strStatus") or "Not Started", "scheduled")

            home_name = e.get("strHomeTeam") or ""
            away_name = e.get("strAwayTeam") or ""
            home_meta = _TEAM_META.get(home_name, (home_name[:3].upper(), None))
            away_meta = _TEAM_META.get(away_name, (away_name[:3].upper(), None))

            result.append(ProviderFixture(
                external_id      = str(e["idEvent"]),
                home_external_id = str(e.get("idHomeTeam") or ""),
                away_external_id = str(e.get("idAwayTeam") or ""),
                home_team_code   = home_meta[0],
                away_team_code   = away_meta[0],
                home_team_name   = home_name,
                away_team_name   = away_name,
                scheduled_at     = scheduled_at,
                int_round        = int_round,
                home_flag_url    = _flag_url(home_meta[1]),
                away_flag_url    = _flag_url(away_meta[1]),
                home_logo_url    = e.get("strHomeTeamBadge") or None,
                away_logo_url    = e.get("strAwayTeamBadge") or None,
                venue            = e.get("strVenue") or None,
                city             = e.get("strCountry") or None,
                status           = status,
                home_score       = _safe_int(e.get("intHomeScore")),
                away_score       = _safe_int(e.get("intAwayScore")),
                thumb_url        = e.get("strThumb") or e.get("strPoster") or None,
            ))

        return result

    # ── Players ───────────────────────────────────────────────────

    async def fetch_players(self, team_external_id: str) -> list[ProviderPlayer]:
        await asyncio.sleep(0.4)  # respect free tier rate limit
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{BASE_URL}/lookup_all_players.php",
                params={"id": team_external_id},
            )
            resp.raise_for_status()
            data = resp.json()

        raw: list[dict] = data.get("player") or []
        result: list[ProviderPlayer] = []

        for p in raw:
            if not p.get("idPlayer") or not p.get("strPlayer"):
                continue

            result.append(ProviderPlayer(
                external_id      = str(p["idPlayer"]),
                team_external_id = team_external_id,
                name             = p["strPlayer"],
                position         = _normalize_position(p.get("strPosition") or ""),
                shirt_number     = _safe_int(p.get("strNumber")),
                photo_url        = p.get("strThumb") or p.get("strCutout") or None,
                date_of_birth    = p.get("dateBorn") or None,
            ))

        return result


# ── Helpers ───────────────────────────────────────────────────────

def _parse_timestamp(ts: str) -> Optional[datetime]:
    """TheSportsDB returns times without TZ — treat as UTC."""
    if not ts:
        return None
    try:
        # Handles: "2026-06-11T19:00:00", "2026-06-11T19:00:00Z", "+00:00" variants
        clean = ts.replace("Z", "+00:00")
        if "+" not in clean and len(clean) == 19:
            clean += "+00:00"
        return datetime.fromisoformat(clean)
    except ValueError:
        try:
            return datetime.strptime(ts[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _safe_int(val, default: Optional[int] = None) -> Optional[int]:
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _flag_url(country_code: Optional[str]) -> Optional[str]:
    if not country_code:
        return None
    return f"https://flagcdn.com/w40/{country_code}.png"


def _normalize_position(raw: str) -> Optional[str]:
    mapping = {
        "Goalkeeper": "GK",
        "Defender":   "DEF",
        "Midfielder": "MID",
        "Forward":    "FWD",
        "Attacker":   "FWD",
        "Winger":     "FWD",
    }
    return mapping.get(raw) or (raw[:3].upper() if raw else None)
