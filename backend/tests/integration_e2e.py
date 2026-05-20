"""
End-to-end integration test.

Validates predictions, scoring, privacy, reveal logic, standings, and leaderboard
updates against the running server and real Supabase database.

Creates fully isolated test fixtures (4 matches, 5 users, 3 leagues) and deletes
them on exit, so production data is never touched.

Usage:
    cd backend && python -m tests.integration_e2e            # run + cleanup
    cd backend && python -m tests.integration_e2e --no-cleanup  # leave data for inspection
"""

import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from jose import jwt
from sqlalchemy import delete, select

# ── path setup ────────────────────────────────────────────────────
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from core.database import SessionLocal
from core.scoring import compute_outcome, ROUND_POINTS
from models.league import League, LeagueMember
from models.match import Match
from models.prediction import Prediction
from models.user import User

# ── configuration ─────────────────────────────────────────────────
BASE    = "http://localhost:8000"
ADMIN_H = {"X-Admin-Key": settings.admin_key}

NO_CLEANUP = "--no-cleanup" in sys.argv

# ── test state ────────────────────────────────────────────────────
_pass = 0
_fail = 0
_issues: list[str] = []
_created_users:   list[str] = []
_created_leagues: list[str] = []
_created_matches: list[str] = []


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════

def _tok(user_id: str) -> str:
    """Generate a valid JWT for a test user."""
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def ok(label: str, *, note: str = "") -> None:
    global _pass
    _pass += 1
    print(f"  ✅  {label}" + (f"  [{note}]" if note else ""))


def fail(label: str, expected, actual, *, note: str = "") -> None:
    global _fail
    _fail += 1
    _issues.append(label)
    print(f"  ❌  {label}")
    print(f"       expected : {expected!r}")
    print(f"       actual   : {actual!r}")
    if note:
        print(f"       note     : {note}")


def chk(label: str, actual, expected, *, note: str = "") -> bool:
    if actual == expected:
        ok(label, note=note)
        return True
    fail(label, expected, actual, note=note)
    return False


def section(title: str) -> None:
    print(f"\n{'─'*62}")
    print(f"  {title}")
    print(f"{'─'*62}")


# ═══════════════════════════════════════════════════════════════════
# Phase 1 – database seeding (direct SQLAlchemy, bypasses Google OAuth)
# ═══════════════════════════════════════════════════════════════════

async def seed_matches(db) -> list[str]:
    """Create 4 isolated test matches with TST* team codes."""
    section("PHASE 1 — Seed test matches")

    base_dt = datetime(2026, 6, 11, 18, 0, tzinfo=timezone.utc)  # well in future → status stays scheduled
    fixtures = [
        # (home_code, away_code, home_name, away_name)
        ("TSTH1", "TSTA1", "Test Home FC",   "Test Away FC"),
        ("TSTH2", "TSTA2", "Test United",    "Test Rovers"),
        ("TSTH3", "TSTA3", "Test Athletic",  "Test City"),
        ("TSTH4", "TSTA4", "Test Rangers",   "Test Villa"),  # privacy test only
    ]
    ids = []
    for i, (hc, ac, hn, an) in enumerate(fixtures):
        mid = str(uuid.uuid4())
        m = Match(
            id             = mid,
            home_team_code = hc,
            away_team_code = ac,
            home_team_name = hn,
            away_team_name = an,
            scheduled_at   = base_dt + timedelta(days=i),
            round          = "group",
            status         = "scheduled",
            external_id    = f"test-e2e-{mid[:8]}",
        )
        db.add(m)
        ids.append(mid)
    await db.commit()
    print(f"  Created {len(ids)} test matches")
    return ids


async def seed_users(db) -> list[tuple[str, str]]:
    """Create 5 test users, return [(user_id, token), ...]."""
    section("PHASE 1 — Seed test users")

    profiles = [
        ("ExactEdge",     "exact.edge@test.wc26",     "🦁"),
        ("GoalGuru",      "goal.guru@test.wc26",       "🐯"),
        ("TacticsMaster", "tactics.master@test.wc26",  "🦊"),
        ("PredictionKing","prediction.king@test.wc26", "🐺"),
        ("MatchWizard",   "match.wizard@test.wc26",    "🦅"),
    ]
    result = []
    for username, email, avatar in profiles:
        uid  = str(uuid.uuid4())
        gid  = f"google-test-{uid[:8]}"
        user = User(
            id        = uid,
            google_id = gid,
            email     = email,
            username  = username,
            avatar_id = avatar,
        )
        db.add(user)
        result.append((uid, _tok(uid)))
    await db.commit()
    print(f"  Created {len(result)} test users: {[p[0] for p in profiles]}")
    return result


# ═══════════════════════════════════════════════════════════════════
# Phase 2 – league setup via API
# ═══════════════════════════════════════════════════════════════════

async def setup_leagues(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
) -> list[str]:
    """
    Create 3 leagues via API with overlapping memberships:
      League 1 "Champions United"  — users 0,1,2,3   (4 members)
      League 2 "Europa Elite"      — users 1,2,3,4   (4 members)
      League 3 "Gold Predictors"   — users 0,2,4     (3 members)
    """
    section("PHASE 2 — Create leagues & memberships via API")

    league_configs = [
        ("Champions United",  [0, 1, 2, 3]),
        ("Europa Elite",      [1, 2, 3, 4]),
        ("Gold Predictors",   [0, 2, 4]),
    ]
    league_ids = []

    for name, member_indices in league_configs:
        creator_idx = member_indices[0]
        _, tok = users[creator_idx]

        r = await client.post("/leagues", json={"name": name}, headers=_auth(tok))
        chk(f"Create league '{name}' → 201", r.status_code, 201)
        data = r.json()
        lid  = data["id"]
        code = data["inviteCode"]
        league_ids.append(lid)

        # Remaining members join with invite code
        for idx in member_indices[1:]:
            _, t = users[idx]
            jr = await client.post("/leagues/join", json={"invite_code": code}, headers=_auth(t))
            chk(f"  User[{idx}] joins '{name}' → 200", jr.status_code, 200)

        print(f"  League '{name}'  id={lid[:8]}  members={member_indices}")

    return league_ids


# ═══════════════════════════════════════════════════════════════════
# Phase 3 – seed predictions via API
# ═══════════════════════════════════════════════════════════════════

# Prediction matrix — each row is one user's predictions [match0, match1, match2, match3]
# Format: (predicted_home, predicted_away)
# Designed to produce deterministic, verifiable scoring outcomes.
PREDS: list[list[tuple[int, int]]] = [
    # User 0 ExactEdge
    [(2, 1), (0, 0), (2, 0), (1, 0)],
    # User 1 GoalGuru
    [(1, 0), (1, 1), (0, 3), (2, 1)],
    # User 2 TacticsMaster
    [(3, 2), (2, 1), (3, 0), (0, 1)],
    # User 3 PredictionKing
    [(0, 0), (1, 1), (2, 1), (1, 1)],
    # User 4 MatchWizard
    [(0, 2), (0, 0), (1, 0), (0, 0)],
]

# Actual results for matches 0-2 (match 3 stays scheduled for privacy tests)
RESULTS = [
    (2, 1),  # match 0: 2-1 home win
    (1, 1),  # match 1: 1-1 draw
    (3, 0),  # match 2: 3-0 home win
]

# Expected outcomes per user per match (hand-verified against scoring engine)
# (outcome, points) for round="group"
EXPECTED_OUTCOMES: list[list[tuple[str, int]]] = [
    # User 0
    [("exact",      3), ("difference", 1), ("outcome",    1)],
    # User 1
    [("difference", 1), ("exact",      3), ("wrong",      0)],
    # User 2
    [("difference", 1), ("wrong",      0), ("exact",      3)],
    # User 3
    [("wrong",      0), ("exact",      3), ("outcome",    1)],
    # User 4
    [("wrong",      0), ("difference", 1), ("outcome",    1)],
]

# Expected total points per user after all 3 matches scored
EXPECTED_TOTALS = [5, 4, 4, 4, 2]


async def seed_predictions(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    match_ids: list[str],
) -> None:
    section("PHASE 3 — Seed predictions via API (4 matches × 5 users)")

    for ui, (uid, tok) in enumerate(users):
        for mi, mid in enumerate(match_ids):
            ph, pa = PREDS[ui][mi]
            r = await client.post(
                f"/predictions/{mid}",
                json={"predicted_home": ph, "predicted_away": pa},
                headers=_auth(tok),
            )
            chk(
                f"  User[{ui}] predicts match[{mi}] {ph}-{pa} → 200",
                r.status_code, 200,
            )

    print(f"  Seeded {len(users) * len(match_ids)} predictions")


# ═══════════════════════════════════════════════════════════════════
# Phase 4 – privacy verification (matches SCHEDULED)
# ═══════════════════════════════════════════════════════════════════

async def verify_privacy_scheduled(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    league_ids: list[str],
    match_ids: list[str],
) -> None:
    section("PHASE 4 — Privacy: scheduled matches (picks must be hidden)")

    lid   = league_ids[0]          # Champions United
    mid   = match_ids[0]           # Test match 0
    u0id, tok0 = users[0]          # ExactEdge — the viewer
    u1id, _    = users[1]          # GoalGuru  — should appear masked

    r = await client.get(
        f"/leagues/{lid}/matches/{mid}/predictions",
        headers=_auth(tok0),
    )
    chk("GET league predictions → 200", r.status_code, 200)
    rows = r.json()
    chk("Returns 4 rows (league1 has users 0-3)", len(rows), 4)

    own = next((x for x in rows if x["userId"] == u0id), None)
    other = next((x for x in rows if x["userId"] == u1id), None)

    # Own pick must always be visible
    if own:
        chk("Own pick is NOT hidden", own["prediction"]["hidden"], False)
        chk(
            f"Own pick scores correct ({PREDS[0][0][0]}-{PREDS[0][0][1]})",
            (own["prediction"]["predictedHome"], own["prediction"]["predictedAway"]),
            PREDS[0][0],
        )
    else:
        fail("Own row present in response", True, False)

    # Other member's pick must be masked before kickoff
    if other:
        chk("Other member's pick IS hidden (scheduled)", other["prediction"]["hidden"], True)
        chk("Masked pick has no predictedHome", other["prediction"]["predictedHome"], None)
        chk("Masked pick has no predictedAway", other["prediction"]["predictedAway"], None)
    else:
        fail("Other member row present", True, False)


async def verify_privacy_early_share(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    league_ids: list[str],
    match_ids: list[str],
) -> None:
    section("PHASE 4b — Privacy: hide_picks_until_kickoff=False (early share)")

    lid       = league_ids[1]       # Europa Elite  (users 1,2,3,4)
    mid       = match_ids[3]        # Test match 3  (stays scheduled throughout test)
    u4id, tok4 = users[4]           # MatchWizard opts into early sharing
    u1id, tok1 = users[1]           # GoalGuru (viewer)
    u3id       = users[3][0]        # PredictionKing (also in Europa Elite, default hide=True)

    # MatchWizard disables hiding
    pr = await client.patch(
        "/users/me/privacy",
        json={"hidePicksUntilKickoff": False},
        headers=_auth(tok4),
    )
    chk("PATCH privacy → 200", pr.status_code, 200)
    chk("Setting persisted", pr.json().get("hidePicksUntilKickoff"), False)

    # GoalGuru views the picks for match 3 in Europa Elite
    r = await client.get(
        f"/leagues/{lid}/matches/{mid}/predictions",
        headers=_auth(tok1),
    )
    chk("GET predictions → 200", r.status_code, 200)
    rows = r.json()

    wizard_row = next((x for x in rows if x["userId"] == u4id), None)
    guru_row   = next((x for x in rows if x["userId"] == u1id), None)

    if wizard_row:
        chk(
            "MatchWizard's pick is visible pre-kickoff (opted out of hiding)",
            wizard_row["prediction"]["hidden"], False,
        )
        chk(
            f"MatchWizard's pick correct ({PREDS[4][3][0]}-{PREDS[4][3][1]})",
            (wizard_row["prediction"]["predictedHome"], wizard_row["prediction"]["predictedAway"]),
            PREDS[4][3],
        )
    else:
        fail("MatchWizard row present", True, False)

    # GoalGuru is the viewer — their OWN pick is always visible (is_own=True).
    # Verify a THIRD user with default hide_picks=True is still masked.
    king_row = next((x for x in rows if x["userId"] == u3id), None)
    if king_row:
        chk("PredictionKing's pick still hidden from GoalGuru (default setting)",
            king_row["prediction"]["hidden"], True)
    else:
        fail("PredictionKing row present in Europa Elite", True, False)

    if guru_row:
        # GoalGuru's OWN pick is always visible to themselves
        chk("GoalGuru's OWN pick visible to themselves",
            guru_row["prediction"]["hidden"], False)
    else:
        fail("GoalGuru row present", True, False)

    # Restore MatchWizard's setting
    await client.patch(
        "/users/me/privacy",
        json={"hidePicksUntilKickoff": True},
        headers=_auth(tok4),
    )


# ═══════════════════════════════════════════════════════════════════
# Phase 5 – score matches via admin API
# ═══════════════════════════════════════════════════════════════════

async def score_matches(
    client: httpx.AsyncClient,
    match_ids: list[str],
) -> None:
    section("PHASE 5 — Score matches 0-2 via admin API")

    for i, (hs, as_) in enumerate(RESULTS):
        mid = match_ids[i]
        r   = await client.patch(
            f"/admin/matches/{mid}/result",
            json={"home_score": hs, "away_score": as_},
            headers=ADMIN_H,
        )
        chk(f"Score match[{i}] {hs}-{as_} → 200", r.status_code, 200)
        if r.status_code == 200:
            data = r.json()
            chk(f"  match[{i}] status=finished", data.get("status"), "finished")
            chk(f"  match[{i}] homeScore={hs}", data.get("homeScore"), hs)
            chk(f"  match[{i}] awayScore={as_}", data.get("awayScore"), as_)


# ═══════════════════════════════════════════════════════════════════
# Phase 6 – verify scoring outcomes and user totals
# ═══════════════════════════════════════════════════════════════════

async def verify_scoring(
    db,
    users: list[tuple[str, str]],
    match_ids: list[str],
) -> None:
    section("PHASE 6 — Verify individual prediction outcomes")

    user_names = ["ExactEdge", "GoalGuru", "TacticsMaster", "PredictionKing", "MatchWizard"]

    # Also cross-check with the scoring engine directly
    print("\n  [Scoring engine verification against expected results]")
    for ui in range(5):
        for mi in range(3):
            ph, pa = PREDS[ui][mi]
            ah, aa = RESULTS[mi]
            exp_outcome, exp_pts = EXPECTED_OUTCOMES[ui][mi]
            got_outcome, got_pts = compute_outcome(ph, pa, ah, aa, "group")
            chk(
                f"  Engine: User[{ui}] match[{mi}] {ph}-{pa} vs {ah}-{aa} → {exp_outcome}/{exp_pts}pts",
                (got_outcome, got_pts), (exp_outcome, exp_pts),
            )

    print("\n  [Database prediction records after scoring]")
    for ui, (uid, _) in enumerate(users):
        for mi, mid in enumerate(match_ids[:3]):
            result = await db.execute(
                select(Prediction).where(
                    Prediction.user_id  == uid,
                    Prediction.match_id == mid,
                )
            )
            pred = result.scalar_one_or_none()
            if pred is None:
                fail(f"DB: User[{ui}] match[{mi}] prediction exists", True, False)
                continue

            exp_outcome, exp_pts = EXPECTED_OUTCOMES[ui][mi]
            chk(
                f"  DB outcome User[{ui}]/match[{mi}]: {exp_outcome}",
                pred.outcome, exp_outcome,
            )
            chk(
                f"  DB points  User[{ui}]/match[{mi}]: {exp_pts}",
                pred.points_earned, exp_pts,
            )

    print("\n  [User total_points after 3 matches]")
    for ui, (uid, _) in enumerate(users):
        user_obj = await db.get(User, uid)
        chk(
            f"  {user_names[ui]} total_points={EXPECTED_TOTALS[ui]}",
            user_obj.total_points, EXPECTED_TOTALS[ui],
        )


# ═══════════════════════════════════════════════════════════════════
# Phase 7 – verify reveal logic (finished matches)
# ═══════════════════════════════════════════════════════════════════

async def verify_reveal(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    league_ids: list[str],
    match_ids: list[str],
) -> None:
    section("PHASE 7 — Verify prediction reveal after kickoff (finished matches)")

    lid   = league_ids[0]          # Champions United
    mid   = match_ids[0]           # Now finished
    _, tok0 = users[0]             # ExactEdge views

    r = await client.get(
        f"/leagues/{lid}/matches/{mid}/predictions",
        headers=_auth(tok0),
    )
    chk("GET predictions for finished match → 200", r.status_code, 200)
    rows = r.json()

    for row in rows:
        uid_short = row["userId"][:8]
        pred = row.get("prediction")
        # All predictions must be revealed after kickoff
        if pred is None:
            fail(f"  User {uid_short} has a prediction row", True, False)
        else:
            chk(
                f"  User {uid_short} pick is revealed (hidden=False)",
                pred["hidden"], False,
            )
            chk(
                f"  User {uid_short} pick has outcome",
                pred["outcome"] is not None, True,
            )
            # Exact score gets the ★ outcome
            if pred["outcome"] == "exact":
                chk(
                    f"  User {uid_short} exact → pointsEarned=3",
                    pred["pointsEarned"], 3,
                )


# ═══════════════════════════════════════════════════════════════════
# Phase 8 – verify league standings and ranking
# ═══════════════════════════════════════════════════════════════════

async def verify_standings(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    league_ids: list[str],
) -> None:
    section("PHASE 8 — Verify league standings and ranking")

    user_ids   = [uid for uid, _ in users]
    user_names = ["ExactEdge", "GoalGuru", "TacticsMaster", "PredictionKing", "MatchWizard"]

    # ── League 1: Champions United (users 0,1,2,3) ───────────────
    lid1   = league_ids[0]
    _, tok = users[0]
    r = await client.get(f"/leagues/{lid1}/standings", headers=_auth(tok))
    chk("League1 standings → 200", r.status_code, 200)
    rows = r.json()
    chk("League1 has 4 members", len(rows), 4)

    # Find each member
    m = {row["userId"]: row for row in rows}
    u0id, u1id, u2id, u3id = user_ids[:4]

    chk("ExactEdge has 5 pts in League1", m[u0id]["totalPoints"], 5)
    chk("GoalGuru has 4 pts in League1", m[u1id]["totalPoints"], 4)
    chk("TacticsMaster has 4 pts in League1", m[u2id]["totalPoints"], 4)
    chk("PredictionKing has 4 pts in League1", m[u3id]["totalPoints"], 4)

    # Rank 1 must be ExactEdge
    rank1_row = next((r for r in rows if r.get("rank") == 1), None)
    if rank1_row:
        chk("Rank 1 is ExactEdge", rank1_row["userId"], u0id,
            note="5pts > everyone else")
    else:
        fail("A rank-1 row exists", True, False)

    # ExactEdge must outrank all others
    ex_rank = m[u0id].get("rank")
    for oid, oname in [(u1id, "GoalGuru"), (u2id, "TacticsMaster"), (u3id, "PredictionKing")]:
        other_rank = m[oid].get("rank")
        if ex_rank is not None and other_rank is not None:
            chk(f"ExactEdge rank < {oname} rank", ex_rank < other_rank, True)

    # Tied users (4pts each) must have ranks 2,3,4 — no duplicates
    tied_ranks = sorted([m[u1id].get("rank"), m[u2id].get("rank"), m[u3id].get("rank")])
    chk("Tied ranks are 2,3,4 (no gaps)", tied_ranks, [2, 3, 4])

    # ── League 2: Europa Elite (users 1,2,3,4) ───────────────────
    lid2   = league_ids[1]
    _, tok = users[1]
    r2 = await client.get(f"/leagues/{lid2}/standings", headers=_auth(tok))
    chk("League2 standings → 200", r2.status_code, 200)
    rows2 = r2.json()
    chk("League2 has 4 members", len(rows2), 4)

    m2 = {row["userId"]: row for row in rows2}
    u4id = user_ids[4]
    chk("MatchWizard has 2 pts in League2", m2[u4id]["totalPoints"], 2)
    chk("MatchWizard has lowest rank in League2", m2[u4id]["rank"], 4)

    # ── League 3: Gold Predictors (users 0,2,4) ──────────────────
    lid3   = league_ids[2]
    _, tok = users[0]
    r3 = await client.get(f"/leagues/{lid3}/standings", headers=_auth(tok))
    chk("League3 standings → 200", r3.status_code, 200)
    rows3 = r3.json()
    chk("League3 has 3 members", len(rows3), 3)

    m3 = {row["userId"]: row for row in rows3}
    chk("ExactEdge leads League3 with 5pts", m3[u0id]["totalPoints"], 5)
    chk("ExactEdge is rank 1 in League3", m3[u0id]["rank"], 1)
    chk("MatchWizard is rank 3 in League3", m3[u4id]["rank"], 3)


# ═══════════════════════════════════════════════════════════════════
# Phase 9 – stats privacy (show_stats = False)
# ═══════════════════════════════════════════════════════════════════

async def verify_stats_privacy(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    league_ids: list[str],
    match_ids: list[str],
) -> None:
    section("PHASE 9 — Stats privacy: show_stats=False hides rank/points from others")

    u3id, tok3 = users[3]   # PredictionKing hides stats
    u0id, tok0 = users[0]   # ExactEdge is the viewer

    # PredictionKing disables stats visibility
    pr = await client.patch(
        "/users/me/privacy",
        json={"showStats": False},
        headers=_auth(tok3),
    )
    chk("PredictionKing PATCH showStats=False → 200", pr.status_code, 200)
    chk("showStats persisted", pr.json().get("showStats"), False)

    # ── Standings view ───────────────────────────────────────────
    lid1 = league_ids[0]
    r = await client.get(f"/leagues/{lid1}/standings", headers=_auth(tok0))
    rows = r.json()
    m = {row["userId"]: row for row in rows}

    chk(
        "PredictionKing totalPoints is null (hidden from others)",
        m[u3id]["totalPoints"], None,
    )
    chk(
        "PredictionKing rank is null (hidden from others)",
        m[u3id]["rank"], None,
    )

    # Others' stats must be unaffected
    chk("ExactEdge points visible (5)", m[u0id]["totalPoints"], 5)
    chk("ExactEdge rank visible (1)", m[u0id]["rank"], 1)

    # ── Picks card view ──────────────────────────────────────────
    mid0 = match_ids[0]
    r2 = await client.get(
        f"/leagues/{lid1}/matches/{mid0}/predictions",
        headers=_auth(tok0),
    )
    pred_rows = r2.json()
    pm = {row["userId"]: row for row in pred_rows}

    chk(
        "PredictionKing totalPoints null in picks card",
        pm[u3id]["totalPoints"], None,
    )
    chk(
        "PredictionKing rank null in picks card",
        pm[u3id]["rank"], None,
    )

    # PredictionKing can still see their OWN stats (always show to owner)
    r3 = await client.get(f"/leagues/{lid1}/standings", headers=_auth(tok3))
    rows3 = r3.json()
    m3 = {row["userId"]: row for row in rows3}
    chk(
        "PredictionKing sees own points when viewing as self (4)",
        m3[u3id]["totalPoints"], 4,
    )
    chk(
        "PredictionKing sees own rank when viewing as self",
        m3[u3id]["rank"] is not None, True,
    )

    # Restore
    await client.patch("/users/me/privacy", json={"showStats": True}, headers=_auth(tok3))


# ═══════════════════════════════════════════════════════════════════
# Phase 10 – stats consistency cross-check
# ═══════════════════════════════════════════════════════════════════

async def verify_stats_endpoints(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
) -> None:
    section("PHASE 10 — /users/me/stats returns correct aggregates")

    user_names = ["ExactEdge", "GoalGuru", "TacticsMaster", "PredictionKing", "MatchWizard"]

    expected_exact = [1, 1, 1, 1, 0]   # exact scores per user
    expected_preds = [4, 4, 4, 4, 4]   # each user predicted all 4 matches

    # correct = exact + outcome + difference (any non-zero-points outcome)
    # Per user across 3 scored matches:
    #   User0: exact(m0)+diff(m1)+outcome(m2) = 3
    #   User1: diff(m0)+exact(m1)+wrong(m2)   = 2
    #   User2: diff(m0)+wrong(m1)+exact(m2)   = 2
    #   User3: wrong(m0)+exact(m1)+outcome(m2)= 2
    #   User4: wrong(m0)+diff(m1)+outcome(m2) = 2
    expected_correct = [3, 2, 2, 2, 2]

    for ui, (uid, tok) in enumerate(users):
        r = await client.get("/users/me/stats", headers=_auth(tok))
        chk(f"{user_names[ui]} /stats → 200", r.status_code, 200)
        if r.status_code != 200:
            continue
        s = r.json()
        chk(f"  {user_names[ui]} totalPoints={EXPECTED_TOTALS[ui]}",
            s.get("totalPoints"), EXPECTED_TOTALS[ui])
        chk(f"  {user_names[ui]} exactScores={expected_exact[ui]}",
            s.get("exactScores"), expected_exact[ui])
        chk(f"  {user_names[ui]} totalPredictions={expected_preds[ui]}",
            s.get("totalPredictions"), expected_preds[ui])
        chk(f"  {user_names[ui]} correctPredictions={expected_correct[ui]}",
            s.get("correctPredictions"), expected_correct[ui])


# ═══════════════════════════════════════════════════════════════════
# Phase 11 – edge cases
# ═══════════════════════════════════════════════════════════════════

async def verify_edge_cases(
    client: httpx.AsyncClient,
    users: list[tuple[str, str]],
    match_ids: list[str],
) -> None:
    section("PHASE 11 — Edge cases")

    _, tok0 = users[0]

    # Cannot predict on a finished match
    mid0 = match_ids[0]
    r = await client.post(
        f"/predictions/{mid0}",
        json={"predicted_home": 1, "predicted_away": 0},
        headers=_auth(tok0),
    )
    chk("Predict on finished match → 422", r.status_code, 422)

    # Can still predict on scheduled match 3
    mid3 = match_ids[3]
    r2 = await client.post(
        f"/predictions/{mid3}",
        json={"predicted_home": 2, "predicted_away": 2},
        headers=_auth(tok0),
    )
    chk("Re-predict on scheduled match → 200 (upsert)", r2.status_code, 200)

    # GET own predictions list includes all
    r3 = await client.get("/predictions/me", headers=_auth(tok0))
    chk("GET /predictions/me → 200", r3.status_code, 200)
    my_preds = r3.json()
    chk("Own predictions count >= 4", len(my_preds) >= 4, True)

    # Privacy endpoint returns all 6 settings
    r4 = await client.get("/users/me/privacy", headers=_auth(tok0))
    chk("GET /users/me/privacy → 200", r4.status_code, 200)
    priv = r4.json()
    expected_keys = {
        "hidePicksUntilKickoff", "profilePublic", "showStats",
        "showActivity", "showFavoriteTeam", "allowLeagueInvites",
    }
    chk("Privacy response has all 6 keys", set(priv.keys()), expected_keys)


# ═══════════════════════════════════════════════════════════════════
# Cleanup
# ═══════════════════════════════════════════════════════════════════

async def cleanup(db, user_ids: list[str], league_ids: list[str], match_ids: list[str]) -> None:
    section("CLEANUP — Removing test fixtures")

    # Delete leagues first (cascades memberships)
    for lid in league_ids:
        await db.execute(delete(League).where(League.id == lid))

    # Delete users (cascades predictions via FK)
    for uid in user_ids:
        await db.execute(delete(User).where(User.id == uid))

    # Delete test matches (after predictions are gone)
    for mid in match_ids:
        await db.execute(delete(Match).where(Match.id == mid))

    await db.commit()
    print(f"  Deleted {len(league_ids)} leagues, {len(user_ids)} users, {len(match_ids)} matches")


# ═══════════════════════════════════════════════════════════════════
# Main orchestrator
# ═══════════════════════════════════════════════════════════════════

async def main() -> None:
    print(f"\n{'═'*62}")
    print(f"  WC26 Predictor — End-to-End Integration Test")
    print(f"  Server : {BASE}")
    print(f"  DB     : Supabase / PostgreSQL")
    print(f"  Cleanup: {'disabled (--no-cleanup)' if NO_CLEANUP else 'enabled'}")
    print(f"{'═'*62}")

    # Verify server is up
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as client:
        try:
            hr = await client.get("/health")
            assert hr.status_code == 200
            print("\n  Server health: ✅ OK")
        except Exception as e:
            print(f"\n  ❌ Server not reachable: {e}")
            sys.exit(1)

    async with SessionLocal() as db:
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
            user_ids: list[str] = []
            league_ids: list[str] = []
            match_ids: list[str] = []

            try:
                # ── Setup ─────────────────────────────────────────────
                match_ids  = await seed_matches(db)
                user_pairs = await seed_users(db)
                user_ids   = [uid for uid, _ in user_pairs]
                league_ids = await setup_leagues(client, user_pairs)

                await seed_predictions(client, user_pairs, match_ids)

                # ── Privacy: scheduled state ───────────────────────────
                await verify_privacy_scheduled(client, user_pairs, league_ids, match_ids)
                await verify_privacy_early_share(client, user_pairs, league_ids, match_ids)

                # ── Score matches ─────────────────────────────────────
                await score_matches(client, match_ids)

                # ── Verify outcomes ───────────────────────────────────
                db.expire_all()   # refresh session cache after scoring (sync method)
                await verify_scoring(db, user_pairs, match_ids)
                await verify_reveal(client, user_pairs, league_ids, match_ids)
                await verify_standings(client, user_pairs, league_ids)
                await verify_stats_privacy(client, user_pairs, league_ids, match_ids)
                await verify_stats_endpoints(client, user_pairs)
                await verify_edge_cases(client, user_pairs, match_ids)

            except Exception as exc:
                print(f"\n  💥 Unexpected error: {exc}")
                import traceback; traceback.print_exc()

            finally:
                if not NO_CLEANUP:
                    await cleanup(db, user_ids, league_ids, match_ids)
                else:
                    print("\n  ⚠️  --no-cleanup: test data left in DB")
                    print(f"  User IDs   : {user_ids}")
                    print(f"  League IDs : {league_ids}")
                    print(f"  Match IDs  : {match_ids}")

    # ── Final report ──────────────────────────────────────────────
    total = _pass + _fail
    print(f"\n{'═'*62}")
    print(f"  RESULTS: {_pass}/{total} passed  ·  {_fail} failed")
    if _issues:
        print(f"\n  FAILURES:")
        for issue in _issues:
            print(f"    • {issue}")
    print(f"{'═'*62}\n")
    sys.exit(0 if _fail == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
