"""
Run with:  python scripts/seed_matches.py
from the backend/ directory (with the venv activated).

Seeds the matches table with the initial 12 World Cup group-stage fixtures.
Re-running is safe — existing matches are skipped.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone

from sqlalchemy import select

from core.database import engine, SessionLocal
from models import Match  # ensures all models are registered

flag = lambda code: f"https://flagcdn.com/w40/{code}.png"

TEAMS = {
    "BRA": ("Brazil",       "br", "A"),
    "FRA": ("France",       "fr", "A"),
    "USA": ("USA",          "us", "A"),
    "MEX": ("Mexico",       "mx", "A"),
    "ARG": ("Argentina",    "ar", "B"),
    "ENG": ("England",      "gb", "B"),
    "MAR": ("Morocco",      "ma", "B"),
    "COL": ("Colombia",     "co", "B"),
    "GER": ("Germany",      "de", "C"),
    "ESP": ("Spain",        "es", "C"),
    "JPN": ("Japan",        "jp", "C"),
    "URU": ("Uruguay",      "uy", "C"),
    "POR": ("Portugal",     "pt", "D"),
    "NED": ("Netherlands",  "nl", "D"),
    "SEN": ("Senegal",      "sn", "D"),
    "ECU": ("Ecuador",      "ec", "D"),
}


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


FIXTURES = [
    # id, home, away, scheduled_at, venue, city, round, group, status, home_score, away_score, minute
    ("m1",  "GER", "ESP", _dt("2026-05-13T18:00:00"), "Allianz Arena",              "Munich",     "group", "C", "finished", 2, 1, None),
    ("m2",  "POR", "NED", _dt("2026-05-13T21:00:00"), "Estádio da Luz",             "Lisbon",     "group", "D", "finished", 1, 1, None),
    ("m3",  "URU", "COL", _dt("2026-05-14T20:00:00"), "Estadio Centenario",         "Montevideo", "group", "C", "finished", 0, 2, None),
    ("m4",  "SEN", "ECU", _dt("2026-05-14T17:00:00"), "Stade Léopold Sédar Senghor","Dakar",      "group", "D", "finished", 3, 1, None),
    ("m5",  "MAR", "JPN", _dt("2026-05-15T19:00:00"), "Grand Stade Hassan II",      "Casablanca", "group", "B", "finished", 2, 2, None),
    ("m6",  "ARG", "ENG", _dt("2026-05-16T16:00:00"), "Rose Bowl",                  "Los Angeles","group", "B", "live",     1, 0, 34),
    ("m7",  "BRA", "FRA", _dt("2026-05-16T20:00:00"), "MetLife Stadium",            "New York",   "group", "A", "scheduled",None,None,None),
    ("m8",  "ESP", "JPN", _dt("2026-05-16T23:00:00"), "AT&T Stadium",               "Dallas",     "group", "C", "scheduled",None,None,None),
    ("m9",  "USA", "MEX", _dt("2026-05-17T22:00:00"), "AT&T Stadium",               "Dallas",     "group", "A", "scheduled",None,None,None),
    ("m10", "POR", "COL", _dt("2026-05-17T18:00:00"), "Estádio da Luz",             "Lisbon",     "group", "D", "scheduled",None,None,None),
    ("m11", "GER", "URU", _dt("2026-05-18T18:00:00"), "Allianz Arena",              "Munich",     "group", "C", "scheduled",None,None,None),
    ("m12", "FRA", "ESP", _dt("2026-05-19T21:00:00"), "Parc des Princes",           "Paris",      "group", "A", "scheduled",None,None,None),
]


async def seed() -> None:
    async with SessionLocal() as db:
        existing_ids = set(
            (await db.execute(select(Match.id))).scalars().all()
        )
        added = 0
        for mid, home_code, away_code, scheduled_at, venue, city, round_, group, status, hs, aw, minute in FIXTURES:
            if mid in existing_ids:
                continue
            home_name, home_flag_code, home_group = TEAMS[home_code]
            away_name, away_flag_code, away_group = TEAMS[away_code]
            db.add(Match(
                id             = mid,
                home_team_code = home_code,
                home_team_name = home_name,
                home_flag_url  = flag(home_flag_code),
                home_group     = home_group,
                away_team_code = away_code,
                away_team_name = away_name,
                away_flag_url  = flag(away_flag_code),
                away_group     = away_group,
                scheduled_at   = scheduled_at,
                venue          = venue,
                city           = city,
                round          = round_,
                group_name     = group,
                status         = status,
                home_score     = hs,
                away_score     = aw,
                minute         = minute,
            ))
            added += 1

        await db.commit()
        print(f"  Seeded {added} match(es). {len(existing_ids)} already existed.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
