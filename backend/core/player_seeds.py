"""
Definitive seed data for Golden Boot candidate players.

This is the single source of truth referenced by:
  - main.py  _seed_manual_players()  — startup bootstrap (idempotent)
  - routers/admin.py  seed_players   — manual admin recovery endpoint

Rules for entries here:
  - Use the player's full common name (API sync will normalise to API format later).
  - photo_url is the canonical API-Football player photo CDN URL.
  - API sync in sync_players() matches by external_ids->>'apifootball' and overwrites
    name/position/shirt_number with live API data on the next sync cycle, so a
    slightly different name here never causes a duplicate row.
"""

from typing import TypedDict


class PlayerSeed(TypedDict):
    apifootball_id: str
    name:           str
    team_id:        str       # lowercase FIFA code matching teams.id
    position:       str       # GK | DEF | MID | FWD
    shirt_number:   int | None


def _photo(api_id: str) -> str:
    return f"https://media.api-sports.io/football/players/{api_id}.png"


GOLDEN_BOOT_PLAYER_SEEDS: list[PlayerSeed] = [
    {"apifootball_id": "874",    "name": "Cristiano Ronaldo", "team_id": "por", "position": "FWD", "shirt_number": 7},
    {"apifootball_id": "278",    "name": "Kylian Mbappé",     "team_id": "fra", "position": "FWD", "shirt_number": 10},
    {"apifootball_id": "1100",   "name": "Erling Haaland",    "team_id": "nor", "position": "FWD", "shirt_number": 9},
    {"apifootball_id": "129718", "name": "Jude Bellingham",   "team_id": "eng", "position": "MID", "shirt_number": 10},
    {"apifootball_id": "184",    "name": "Harry Kane",        "team_id": "eng", "position": "FWD", "shirt_number": 9},
    {"apifootball_id": "154",    "name": "Lionel Messi",      "team_id": "arg", "position": "FWD", "shirt_number": 10},
    {"apifootball_id": "762",    "name": "Vinícius Júnior",   "team_id": "bra", "position": "FWD", "shirt_number": 7},
    {"apifootball_id": "386828", "name": "Lamine Yamal",      "team_id": "esp", "position": "FWD", "shirt_number": 19},
    {"apifootball_id": "978",    "name": "Kai Havertz",       "team_id": "ger", "position": "FWD", "shirt_number": 9},
    {"apifootball_id": "377122", "name": "Endrick",           "team_id": "bra", "position": "FWD", "shirt_number": None},
    {"apifootball_id": "51617",  "name": "Darwin Núñez",      "team_id": "uru", "position": "FWD", "shirt_number": 9},
    {"apifootball_id": "2489",   "name": "Luis Díaz",         "team_id": "col", "position": "FWD", "shirt_number": 7},
    {"apifootball_id": "276",    "name": "Neymar",            "team_id": "bra", "position": "FWD", "shirt_number": 10},
    {"apifootball_id": "18979",  "name": "Viktor Gyökeres",   "team_id": "swe", "position": "FWD", "shirt_number": 9},
    {"apifootball_id": "1496",   "name": "Raphinha",          "team_id": "bra", "position": "MID", "shirt_number": 11},
    # Players absent from API-Football WC2026 squad data — manually seeded so they are always searchable
    {"apifootball_id": "636",    "name": "Bernardo Silva",    "team_id": "por", "position": "MID", "shirt_number": 10},
    {"apifootball_id": "10009",  "name": "Rodrygo",           "team_id": "bra", "position": "FWD", "shirt_number": 11},
    {"apifootball_id": "37127",  "name": "Martin Ødegaard",   "team_id": "nor", "position": "MID", "shirt_number": 8},
    # Players whose API-Football squad name is abbreviated — seeded with full name for search quality
    {"apifootball_id": "631",    "name": "Phil Foden",        "team_id": "eng", "position": "MID", "shirt_number": 47},
]
