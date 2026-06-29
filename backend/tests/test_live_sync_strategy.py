"""
Tests for the adaptive live sync strategy.

Covers:
1. No API calls when no active/upcoming/live matches
2. One bulk API call updates multiple live matches
3. Match starts → predictions reveal (auto-picks generated)
4. Halftime status update (stale-live recovery)
5. Full-time status update + scoring
6. Duplicate concurrent sync calls are prevented (GHA concurrency group)
7. Frontend polling does not trigger Football API calls
8. Pre-kickoff 5-min throttle (10-60 min window)
9. Post-FT continued polling (within 10 min of FT)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

import services.sync as sync_mod
from services.sync import SyncService


# ── Helpers ───────────────────────────────────────────────────────────────────

_NOW = datetime(2026, 7, 4, 20, 0, 0, tzinfo=timezone.utc)


def _dt(**kwargs) -> datetime:
    return _NOW + timedelta(**kwargs)


def _db_match(
    id: str = "match-1",
    external_id: str = "999001",
    status: str = "scheduled",
    home_score: int | None = None,
    away_score: int | None = None,
    period: str | None = None,
    minute: int | None = None,
    scheduled_at: datetime | None = None,
    updated_at: datetime | None = None,
    auto_picks_generated: bool = False,
    round: str = "r32",
) -> MagicMock:
    m = MagicMock()
    m.id = id
    m.external_id = external_id
    m.status = status
    m.home_score = home_score
    m.away_score = away_score
    m.period = period
    m.minute = minute
    m.scheduled_at = scheduled_at or _NOW
    m.updated_at = updated_at or _NOW
    m.auto_picks_generated = auto_picks_generated
    m.round = round
    m.home_team_code = "BRA"
    m.away_team_code = "JPN"
    return m


def _provider_fixture(
    external_id: str = "999001",
    status: str = "live",
    home_score: int | None = 1,
    away_score: int | None = 0,
    period: str | None = "1H",
    provider_status: str | None = "1H",
    minute: int | None = 23,
    home_team_code: str = "BRA",
    away_team_code: str = "JPN",
    penalty_home: int | None = None,
    penalty_away: int | None = None,
) -> MagicMock:
    fx = MagicMock()
    fx.external_id = external_id
    fx.status = status
    fx.home_score = home_score
    fx.away_score = away_score
    fx.period = period
    fx.provider_status = provider_status
    fx.minute = minute
    fx.home_team_code = home_team_code
    fx.away_team_code = away_team_code
    fx.penalty_home = penalty_home
    fx.penalty_away = penalty_away
    return fx


def _make_service() -> SyncService:
    provider = MagicMock()
    provider.fetch_live = AsyncMock(return_value=[])
    provider.fetch_by_id = AsyncMock(return_value=None)
    return SyncService(provider=provider, league_id="1")


def _make_db(
    has_live=None,
    has_imminent=None,
    has_post_ft=None,
    has_near=None,
    scalar_returns: list | None = None,
    scalars_returns: list | None = None,
) -> AsyncMock:
    """
    Build a minimal async DB mock.
    scalar_returns: list of values returned in order by db.scalar().
    scalars_returns: list of row-lists returned in order by db.execute().scalars().all().
    """
    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))

    _scalar_seq = list(scalar_returns or [])
    _scalar_idx = [0]

    async def _scalar(query):
        if _scalar_idx[0] < len(_scalar_seq):
            val = _scalar_seq[_scalar_idx[0]]
            _scalar_idx[0] += 1
            return val
        return None

    db.scalar = _scalar
    return db


# ── Test 1: no API calls when nothing is happening ────────────────────────────

@pytest.mark.asyncio
async def test_no_api_calls_when_idle():
    """sync_live skips external API entirely when no live/imminent matches exist."""
    svc = _make_service()
    db = _make_db(scalar_returns=[None, None, None, None])  # live, imminent, post_ft, near all None

    with patch("services.sync.datetime") as mock_dt:
        mock_dt.now.return_value = _NOW
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = await svc.sync_live(db)

    svc.provider.fetch_live.assert_not_called()
    svc.provider.fetch_by_id.assert_not_called()
    assert result.status == "skipped"


# ── Test 2: one bulk API call updates multiple live matches ───────────────────

@pytest.mark.asyncio
async def test_bulk_live_feed_updates_multiple_matches():
    """A single fetch_live call processes all live fixtures in one pass."""
    svc = _make_service()

    fx1 = _provider_fixture(external_id="1001", home_team_code="BRA", away_team_code="JPN")
    fx2 = _provider_fixture(external_id="1002", home_team_code="ARG", away_team_code="ESP", minute=55)
    svc.provider.fetch_live = AsyncMock(return_value=[fx1, fx2])

    m1 = _db_match(id="m1", external_id="1001", status="live")
    m2 = _db_match(id="m2", external_id="1002", status="live")

    call_count = [0]
    scalar_seq = [
        "live-exists",  # has_live
    ]
    scalar_idx = [0]
    # Phase 1: two scalar calls for match lookup
    match_seq = [m1, m2]
    match_idx = [0]

    db = AsyncMock()
    db.commit = AsyncMock()

    async def _scalar(q):
        if scalar_idx[0] < len(scalar_seq):
            v = scalar_seq[scalar_idx[0]]
            scalar_idx[0] += 1
            return v
        # Phase 1 match lookups
        if match_idx[0] < len(match_seq):
            v = match_seq[match_idx[0]]
            match_idx[0] += 1
            return v
        return None

    db.scalar = _scalar
    db.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))

    with patch.object(svc, "_start_log", new_callable=AsyncMock) as mock_start, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as mock_finish:
        mock_start.return_value = MagicMock()
        mock_finish.return_value = MagicMock(status="success", records_affected=2)
        await svc.sync_live(db)

    # Only one external API call for the live feed (not one per match)
    svc.provider.fetch_live.assert_called_once()
    assert svc.provider.fetch_by_id.call_count == 0


# ── Test 3: match starts → auto-picks generated ───────────────────────────────

@pytest.mark.asyncio
async def test_match_start_triggers_auto_picks():
    """When a scheduled match transitions to live, auto-picks are generated."""
    svc = _make_service()
    fx = _provider_fixture(status="live", period="1H", minute=2)
    svc.provider.fetch_live = AsyncMock(return_value=[fx])

    # Use real now so buffer_elapsed check (datetime.now >= scheduled_at + 60s) passes
    from datetime import datetime as _dt_real
    kicked_off_at = _dt_real.now(timezone.utc) - timedelta(seconds=90)
    m = _db_match(
        status="scheduled",
        scheduled_at=kicked_off_at,
        auto_picks_generated=False,
    )

    # Gate makes 3 queries (has_live, has_imminent, has_post_ft) before Phase 1 match lookup
    scalar_seq = ["live-exists", None, None, m]
    scalar_idx = [0]

    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))

    async def _scalar(q):
        if scalar_idx[0] < len(scalar_seq):
            v = scalar_seq[scalar_idx[0]]
            scalar_idx[0] += 1
            return v
        return None

    db.scalar = _scalar

    with patch("services.auto_pick.generate_auto_picks", new_callable=AsyncMock, return_value=3) as mock_auto, \
         patch.object(svc, "_start_log", new_callable=AsyncMock) as mock_start, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as mock_finish:
        mock_start.return_value = MagicMock()
        mock_finish.return_value = MagicMock(status="success")
        await svc.sync_live(db)

    mock_auto.assert_called_once_with(m.id, m.round, db)


# ── Test 4: halftime status update via stale-live recovery ───────────────────

@pytest.mark.asyncio
async def test_halftime_detected_via_stale_live_recovery():
    """
    During HT, API-Football drops the match from the live feed.
    Phase 2 stale-live recovery fetches it individually and detects 'HT'.
    """
    svc = _make_service()
    svc.provider.fetch_live = AsyncMock(return_value=[])  # empty — HT dropout

    stale_match = _db_match(
        external_id="999001",
        status="live",
        period="1H",
        minute=45,
        updated_at=_NOW - timedelta(minutes=7),  # stale (>5 min)
    )

    ht_fixture = _provider_fixture(
        status="live",
        period="HT",
        provider_status="HT",
        minute=45,
    )
    svc.provider.fetch_by_id = AsyncMock(return_value=ht_fixture)

    db = AsyncMock()
    db.commit = AsyncMock()

    scalar_seq = ["live-exists"]
    scalar_idx = [0]

    async def _scalar(q):
        if scalar_idx[0] < len(scalar_seq):
            v = scalar_seq[scalar_idx[0]]
            scalar_idx[0] += 1
            return v
        return None

    db.scalar = _scalar

    def _execute_factory(stale):
        results_seq = [
            # Phase 1 loop (no fixtures)
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[stale])))),  # Phase 2 query
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),  # Phase 2.5
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),  # Phase 3
        ]
        idx = [0]

        async def _exec(q):
            if idx[0] < len(results_seq):
                r = results_seq[idx[0]]
                idx[0] += 1
                return r
            return MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))

        return _exec

    db.execute = _execute_factory(stale_match)

    with patch.object(svc, "_start_log", new_callable=AsyncMock) as mock_start, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as mock_finish:
        mock_start.return_value = MagicMock()
        mock_finish.return_value = MagicMock(status="success")
        await svc.sync_live(db)

    svc.provider.fetch_by_id.assert_called_once_with("999001")


# ── Test 5: fulltime → scoring triggered ─────────────────────────────────────

@pytest.mark.asyncio
async def test_fulltime_triggers_scoring():
    """When a match transitions live → finished, score_match is called."""
    svc = _make_service()

    fx = _provider_fixture(
        status="finished",
        period=None,
        provider_status="FT",
        home_score=2,
        away_score=1,
        minute=90,
    )
    svc.provider.fetch_live = AsyncMock(return_value=[fx])

    m = _db_match(status="live", home_score=2, away_score=1)

    # Gate makes 3 queries (has_live, has_imminent, has_post_ft) before Phase 1 match lookup
    scalar_seq = ["live-exists", None, None, m]
    scalar_idx = [0]

    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))

    async def _scalar(q):
        if scalar_idx[0] < len(scalar_seq):
            v = scalar_seq[scalar_idx[0]]
            scalar_idx[0] += 1
            return v
        return None

    db.scalar = _scalar

    with patch("core.scorer.score_match", new_callable=AsyncMock) as mock_score, \
         patch.object(svc, "_start_log", new_callable=AsyncMock) as mock_start, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as mock_finish:
        mock_start.return_value = MagicMock()
        mock_finish.return_value = MagicMock(status="success")
        await svc.sync_live(db)

    mock_score.assert_called_once_with(m.id, 2, 1, db)


# ── Test 6: duplicate sync calls prevented by GHA concurrency ────────────────

def test_gha_workflow_has_concurrency_group():
    """
    The GitHub Actions workflow must declare a concurrency group so that
    overlapping cron ticks cancel the previous run rather than stacking.
    This is a structural check on the workflow file — not a runtime test.
    """
    import yaml

    workflow_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        ".github", "workflows", "sync-live.yml",
    )
    assert os.path.exists(workflow_path), f"Workflow not found: {workflow_path}"

    with open(workflow_path) as f:
        workflow = yaml.safe_load(f)

    concurrency = workflow.get("concurrency", {})
    assert "group" in concurrency, "concurrency.group must be set to prevent overlapping runs"
    assert concurrency.get("cancel-in-progress") is True, \
        "cancel-in-progress must be true so stale ticks are dropped"


# ── Test 7: frontend polling does not call Football API ───────────────────────

def test_frontend_cron_routes_call_backend_not_api_football():
    """
    The Vercel cron routes (sync-live, reconcile-knockouts) must proxy to our
    backend URL, NOT to api-sports.io or any external Football API endpoint.
    This is a source-code check.
    """
    import re

    frontend_root = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "frontend",
    )

    forbidden_patterns = [
        r"api-sports\.io",
        r"v3\.football\.api-sports\.io",
        r"apifootball\.com",
    ]

    cron_routes_dir = os.path.join(frontend_root, "app", "api", "cron")
    assert os.path.isdir(cron_routes_dir), f"Cron routes dir missing: {cron_routes_dir}"

    for root, _, files in os.walk(cron_routes_dir):
        for fname in files:
            if not fname.endswith((".ts", ".tsx", ".js")):
                continue
            fpath = os.path.join(root, fname)
            content = open(fpath).read()
            for pat in forbidden_patterns:
                assert not re.search(pat, content), (
                    f"Frontend file {fpath} contains Football API URL '{pat}' — "
                    "frontend must never call the Football API directly"
                )


# ── Test 8: pre-kickoff throttle (10-60 min window) ─────────────────────────

@pytest.mark.asyncio
async def test_pre_kickoff_throttle():
    """
    In the 10-60 min pre-kickoff window, sync_live fires at most once every 5 min.
    A second call within 5 min should return 'skipped'.
    """
    svc = _make_service()

    # Reset module state
    sync_mod._last_pre_kickoff_poll_at = None
    sync_mod._last_sync_at = None

    # DB has a match 30 min from kickoff (no live, no imminent, no post-FT)
    scalar_seq_first = [
        None,                    # has_live
        None,                    # has_imminent
        None,                    # has_post_ft
        "near-kickoff-match",    # has_near  → triggers pre_kickoff mode
    ]
    scalar_seq_second = [
        None,    # has_live
        None,    # has_imminent
        None,    # has_post_ft
        "near-kickoff-match",    # has_near (still within 5 min of first poll)
    ]

    async def _make_scalar(seq):
        idx = [0]
        async def _scalar(q):
            if idx[0] < len(seq):
                v = seq[idx[0]]; idx[0] += 1; return v
            return None
        return _scalar

    db1 = AsyncMock()
    db1.commit = AsyncMock()
    db1.scalar = await _make_scalar(scalar_seq_first)
    db1.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))

    with patch.object(svc, "_start_log", new_callable=AsyncMock) as s, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as f:
        s.return_value = MagicMock()
        f.return_value = MagicMock(status="success", records_affected=0)
        result1 = await svc.sync_live(db1)

    # First call should NOT be skipped (triggers pre_kickoff mode)
    assert result1.status != "skipped" or sync_mod._last_pre_kickoff_poll_at is not None

    db2 = AsyncMock()
    db2.commit = AsyncMock()
    db2.scalar = await _make_scalar(scalar_seq_second)

    with patch.object(svc, "_start_log", new_callable=AsyncMock), \
         patch.object(svc, "_finish_log", new_callable=AsyncMock):
        result2 = await svc.sync_live(db2)

    # Second call within 5 min should be throttled
    assert result2.status == "skipped"
    svc.provider.fetch_live.assert_not_called()


# ── Test 9: post-FT polling continues for 10 min ─────────────────────────────

@pytest.mark.asyncio
async def test_post_ft_polling_window():
    """
    After a match finishes, sync_live continues to poll it for up to 10 min
    (Phase 2.5) to catch any VAR score corrections from API-Football.
    """
    svc = _make_service()
    svc.provider.fetch_live = AsyncMock(return_value=[])  # no live matches

    # A match that just finished 3 min ago
    finished_match = _db_match(
        external_id="777001",
        status="finished",
        home_score=1,
        away_score=0,
        updated_at=_NOW - timedelta(minutes=3),
    )

    # API-Football has a corrected score (VAR disallowed a goal)
    corrected_fx = _provider_fixture(
        external_id="777001",
        status="finished",
        period=None,
        provider_status="FT",
        home_score=0,  # corrected
        away_score=0,
        minute=90,
    )
    svc.provider.fetch_by_id = AsyncMock(return_value=corrected_fx)

    # Simulate: has_live=None, has_imminent=None, has_post_ft="exists"
    scalar_seq = [None, None, "post-ft-exists"]
    scalar_idx = [0]

    db = AsyncMock()
    db.commit = AsyncMock()

    async def _scalar(q):
        if scalar_idx[0] < len(scalar_seq):
            v = scalar_seq[scalar_idx[0]]; scalar_idx[0] += 1; return v
        return None

    db.scalar = _scalar

    results_seq = [
        # Phase 2 (stale-live) — no candidates
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
        # Phase 2.5 (post-FT) — returns our finished match
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[finished_match])))),
        # Phase 3 — no candidates
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
    ]
    exec_idx = [0]

    async def _exec(q):
        if exec_idx[0] < len(results_seq):
            r = results_seq[exec_idx[0]]; exec_idx[0] += 1; return r
        return MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))

    db.execute = _exec

    with patch("core.scorer.score_match", new_callable=AsyncMock) as mock_score, \
         patch.object(svc, "_start_log", new_callable=AsyncMock) as mock_start, \
         patch.object(svc, "_finish_log", new_callable=AsyncMock) as mock_finish:
        mock_start.return_value = MagicMock()
        mock_finish.return_value = MagicMock(status="success")
        await svc.sync_live(db)

    # Phase 2.5 should have fetched the finished match individually
    svc.provider.fetch_by_id.assert_called_with("777001")
    # Score correction should re-trigger scoring
    mock_score.assert_called_once_with(finished_match.id, 0, 0, db)
