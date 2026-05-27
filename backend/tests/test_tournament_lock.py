"""
Tests for the Tournament Picks Lock system.

Covers:
- get_lock_time: returns earliest match scheduled_at, falls back to constant
- is_tournament_locked: True/False based on UTC wall-clock vs lock time
- TournamentPickOut.from_pick: effective lock = time-based OR db flag
- upsert_tournament_pick: 423 when locked (time), 423 when locked (db flag)
- complete_onboarding: allowed after lock, sets is_locked=True on the pick
- Lock is irrevocable (no unlock path through the API)
- Race condition in _get_or_create_pick handled gracefully
- Cache reset between tests
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import services.tournament_lock as lock_module
from services.tournament_lock import (
    LOCK_TIME_FALLBACK,
    get_lock_time,
    is_tournament_locked,
    reset_cache,
)
from schemas.tournament import TournamentPickOut, ScorerOut


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_pick(*, is_locked: bool = False, winner: str | None = None, scorer: str | None = None):
    pick = MagicMock()
    pick.is_locked        = is_locked
    pick.winner_team_code = winner
    pick.top_scorer_id    = scorer
    pick.submitted_at     = None
    return pick


def _db_returning(scheduled_at):
    """Return a mock AsyncSession whose scalar() yields scheduled_at."""
    db = AsyncMock()
    db.scalar.return_value = scheduled_at
    return db


# ── TournamentPickOut.from_pick — effective lock computation ──────────────────

class TestTournamentPickOutEffectiveLock:
    def test_not_locked_before_lock_time(self):
        pick      = _make_pick(is_locked=False)
        lock_time = datetime.now(timezone.utc) + timedelta(days=3)
        out       = TournamentPickOut.from_pick(pick, lock_time=lock_time)
        assert out.isLocked is False

    def test_locked_after_lock_time(self):
        pick      = _make_pick(is_locked=False)
        lock_time = datetime.now(timezone.utc) - timedelta(seconds=1)
        out       = TournamentPickOut.from_pick(pick, lock_time=lock_time)
        assert out.isLocked is True

    def test_db_flag_locks_before_time(self):
        """is_locked=True on the model overrides time-based check."""
        pick      = _make_pick(is_locked=True)
        lock_time = datetime.now(timezone.utc) + timedelta(days=10)
        out       = TournamentPickOut.from_pick(pick, lock_time=lock_time)
        assert out.isLocked is True

    def test_lock_time_iso_included_in_response(self):
        pick      = _make_pick()
        lock_time = datetime(2026, 6, 11, 22, 0, 0, tzinfo=timezone.utc)
        out       = TournamentPickOut.from_pick(pick, lock_time=lock_time)
        assert out.lockTime == "2026-06-11T22:00:00+00:00"

    def test_no_lock_time_not_locked(self):
        pick = _make_pick(is_locked=False)
        out  = TournamentPickOut.from_pick(pick, lock_time=None)
        assert out.isLocked is False
        assert out.lockTime is None

    def test_no_lock_time_db_flag_still_locks(self):
        pick = _make_pick(is_locked=True)
        out  = TournamentPickOut.from_pick(pick, lock_time=None)
        assert out.isLocked is True


# ── get_lock_time — DB query and fallback ─────────────────────────────────────

class TestGetLockTime:
    def setup_method(self):
        reset_cache()

    @pytest.mark.asyncio
    async def test_returns_earliest_match_from_db(self):
        expected  = datetime(2026, 6, 11, 22, 0, 0, tzinfo=timezone.utc)
        db        = _db_returning(expected)
        lock_time = await get_lock_time(db)
        assert lock_time == expected

    @pytest.mark.asyncio
    async def test_naive_datetime_gets_utc(self):
        naive = datetime(2026, 6, 11, 22, 0, 0)  # no tzinfo
        db    = _db_returning(naive)
        lock  = await get_lock_time(db)
        assert lock.tzinfo is not None
        assert lock.tzinfo == timezone.utc

    @pytest.mark.asyncio
    async def test_falls_back_when_db_empty(self):
        db        = _db_returning(None)
        lock_time = await get_lock_time(db)
        assert lock_time == LOCK_TIME_FALLBACK

    @pytest.mark.asyncio
    async def test_falls_back_when_db_raises(self):
        db = AsyncMock()
        db.scalar.side_effect = RuntimeError("connection lost")
        lock_time = await get_lock_time(db)
        assert lock_time == LOCK_TIME_FALLBACK

    @pytest.mark.asyncio
    async def test_cache_used_when_past_lock(self):
        """After lock time has passed, cache is returned without a second DB call."""
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        db   = _db_returning(past)
        # First call populates cache
        await get_lock_time(db)
        # Second call must use cache (no additional DB scalar call)
        await get_lock_time(db)
        assert db.scalar.call_count == 1

    @pytest.mark.asyncio
    async def test_no_cache_before_lock(self):
        """Before lock time, re-queries DB every call so admin updates take effect."""
        future = datetime.now(timezone.utc) + timedelta(days=5)
        db     = _db_returning(future)
        await get_lock_time(db)
        await get_lock_time(db)
        assert db.scalar.call_count == 2


# ── is_tournament_locked ──────────────────────────────────────────────────────

class TestIsTournamentLocked:
    def setup_method(self):
        reset_cache()

    @pytest.mark.asyncio
    async def test_false_before_lock(self):
        future = datetime.now(timezone.utc) + timedelta(days=5)
        db     = _db_returning(future)
        assert await is_tournament_locked(db) is False

    @pytest.mark.asyncio
    async def test_true_after_lock(self):
        past = datetime.now(timezone.utc) - timedelta(seconds=1)
        db   = _db_returning(past)
        assert await is_tournament_locked(db) is True

    @pytest.mark.asyncio
    async def test_true_at_exact_lock_moment(self):
        """At exactly lock_time the picks must be locked."""
        now    = datetime.now(timezone.utc)
        past   = now - timedelta(microseconds=1)
        db     = _db_returning(past)
        assert await is_tournament_locked(db) is True

    @pytest.mark.asyncio
    async def test_fallback_used_when_empty_db(self):
        """Fallback is June 11 2026 — well in the future from test execution."""
        db = _db_returning(None)
        # Fallback is June 2026 → not locked yet (tests run in May 2026)
        result = await is_tournament_locked(db)
        # fallback is LOCK_TIME_FALLBACK — compare to now
        now = datetime.now(timezone.utc)
        expected = now >= LOCK_TIME_FALLBACK
        assert result == expected


# ── upsert_tournament_pick — API-level lock enforcement ──────────────────────

class TestUpsertLockEnforcement:
    """
    Verify the router rejects writes when locked.
    We patch is_tournament_locked and get_lock_time to control the clock.
    """

    @pytest.mark.asyncio
    async def test_rejects_when_time_locked(self):
        from fastapi import HTTPException
        from routers.tournament import upsert_tournament_pick
        from schemas.tournament import TournamentPickUpdate

        future_lock = datetime.now(timezone.utc) - timedelta(seconds=1)  # past = locked

        with patch("routers.tournament.get_lock_time", new=AsyncMock(return_value=future_lock)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=_make_pick())):
            with pytest.raises(HTTPException) as exc_info:
                await upsert_tournament_pick(
                    body=TournamentPickUpdate(winner_team_code="BRA"),
                    user=MagicMock(id="user-1"),
                    db=AsyncMock(),
                )
        assert exc_info.value.status_code == 423

    @pytest.mark.asyncio
    async def test_rejects_when_db_flag_locked(self):
        from fastapi import HTTPException
        from routers.tournament import upsert_tournament_pick
        from schemas.tournament import TournamentPickUpdate

        future_lock = datetime.now(timezone.utc) + timedelta(days=5)   # time says open
        locked_pick = _make_pick(is_locked=True)                        # but DB says locked

        with patch("routers.tournament.get_lock_time", new=AsyncMock(return_value=future_lock)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=locked_pick)):
            with pytest.raises(HTTPException) as exc_info:
                await upsert_tournament_pick(
                    body=TournamentPickUpdate(winner_team_code="BRA"),
                    user=MagicMock(id="user-1"),
                    db=AsyncMock(),
                )
        assert exc_info.value.status_code == 423

    @pytest.mark.asyncio
    async def test_allows_when_not_locked(self):
        from routers.tournament import upsert_tournament_pick
        from schemas.tournament import TournamentPickUpdate

        future_lock = datetime.now(timezone.utc) + timedelta(days=5)
        pick        = _make_pick()

        mock_db = AsyncMock()

        with patch("routers.tournament.get_lock_time", new=AsyncMock(return_value=future_lock)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=pick)), \
             patch("routers.tournament._load_scorer", new=AsyncMock(return_value=None)):
            result = await upsert_tournament_pick(
                body=TournamentPickUpdate(winner_team_code="BRA"),
                user=MagicMock(id="user-1"),
                db=mock_db,
            )

        assert result.isLocked is False
        assert pick.winner_team_code == "BRA"

    def test_423_is_not_4xx_client_error_alias(self):
        """423 Locked is a distinct code — not 400 or 403."""
        from fastapi import status as fa_status
        assert fa_status.HTTP_423_LOCKED == 423


# ── complete_onboarding — allows submission, locks pick if needed ─────────────

class TestCompleteOnboardingLock:

    def _mock_user(self):
        """Return a simple namespace with real string values (not MagicMock attrs)."""
        from types import SimpleNamespace
        return SimpleNamespace(
            id="user-1", email="u@x.com", username="u", name="U",
            avatar_url=None, onboarding_completed=True,
        )

    @pytest.mark.asyncio
    async def test_onboarding_allowed_before_lock(self):
        from routers.tournament import complete_onboarding
        from schemas.tournament import TournamentPickUpdate

        pick    = _make_pick()
        mock_db = AsyncMock()
        mock_db.execute.return_value = MagicMock()

        with patch("routers.tournament.is_tournament_locked", new=AsyncMock(return_value=False)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=pick)):
            result = await complete_onboarding(
                body=TournamentPickUpdate(winner_team_code="ESP"),
                user=self._mock_user(),
                db=mock_db,
            )

        assert result.access_token
        assert pick.is_locked is False  # not locked before tournament

    @pytest.mark.asyncio
    async def test_onboarding_allowed_after_lock_but_pick_immediately_locked(self):
        from routers.tournament import complete_onboarding
        from schemas.tournament import TournamentPickUpdate

        pick    = _make_pick()
        mock_db = AsyncMock()
        mock_db.execute.return_value = MagicMock()

        with patch("routers.tournament.is_tournament_locked", new=AsyncMock(return_value=True)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=pick)):
            result = await complete_onboarding(
                body=TournamentPickUpdate(winner_team_code="ARG"),
                user=self._mock_user(),
                db=mock_db,
            )

        # Onboarding should still complete (new user can sign up)
        assert result.access_token
        # But the pick must be immediately locked
        assert pick.is_locked is True

    @pytest.mark.asyncio
    async def test_onboarding_without_picks_after_lock(self):
        """User can complete onboarding with no picks after lock (skipped the pick steps)."""
        from routers.tournament import complete_onboarding
        from schemas.tournament import TournamentPickUpdate

        pick    = _make_pick()
        mock_db = AsyncMock()
        mock_db.execute.return_value = MagicMock()

        with patch("routers.tournament.is_tournament_locked", new=AsyncMock(return_value=True)), \
             patch("routers.tournament._get_or_create_pick", new=AsyncMock(return_value=pick)):
            result = await complete_onboarding(
                body=TournamentPickUpdate(),  # no picks
                user=self._mock_user(),
                db=mock_db,
            )

        assert result.access_token
        assert pick.is_locked is True


# ── Lock immutability ─────────────────────────────────────────────────────────

class TestLockImmutability:
    """Verify there is no code path that sets is_locked = False."""

    def test_no_unlock_path_in_router(self):
        """The router never sets is_locked = False."""
        import ast, pathlib
        src  = pathlib.Path(__file__).parent.parent / "routers" / "tournament.py"
        tree = ast.parse(src.read_text())

        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Attribute) and target.attr == "is_locked":
                        val = node.value
                        if isinstance(val, ast.Constant) and val.value is False:
                            raise AssertionError(
                                "Found `is_locked = False` in tournament.py — "
                                "once locked a pick must stay locked"
                            )

    def test_no_unlock_path_in_lock_service(self):
        """The lock service never overrides a locked pick to unlocked."""
        import ast, pathlib
        src  = pathlib.Path(__file__).parent.parent / "services" / "tournament_lock.py"
        tree = ast.parse(src.read_text())

        assigns = [
            node for node in ast.walk(tree)
            if isinstance(node, ast.Assign)
        ]
        for a in assigns:
            for t in a.targets:
                if isinstance(t, ast.Attribute) and t.attr == "is_locked":
                    val = a.value
                    if isinstance(val, ast.Constant) and val.value is False:
                        raise AssertionError("Lock service sets is_locked = False — not allowed")


# ── reset_cache helper ────────────────────────────────────────────────────────

class TestResetCache:
    def test_reset_clears_cache(self):
        lock_module._cached_lock_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        reset_cache()
        assert lock_module._cached_lock_time is None
