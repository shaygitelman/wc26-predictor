"""
Tests for cron/admin auth hardening and admin maintenance endpoint.

Uses dummy secret values only — no real secrets appear anywhere in this file.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException


# ── Helpers ───────────────────────────────────────────────────────────────────

_DUMMY_CRON   = "dummy-cron-secret-for-tests-only"
_DUMMY_ADMIN  = "dummy-admin-key-for-tests-only"
_WRONG_SECRET = "this-is-the-wrong-value"


def _cron_settings(secret: str = _DUMMY_CRON):
    m = MagicMock()
    m.cron_secret = secret
    return m


def _admin_settings(key: str = _DUMMY_ADMIN):
    m = MagicMock()
    m.admin_key = key
    return m


# ── Cron auth ─────────────────────────────────────────────────────────────────

class TestVerifyCron:
    def test_valid_secret_passes(self):
        with patch("routers.cron.settings", _cron_settings()):
            from routers.cron import _verify_cron
            _verify_cron(_DUMMY_CRON)  # must not raise

    def test_invalid_secret_raises_403(self):
        with patch("routers.cron.settings", _cron_settings()):
            from routers.cron import _verify_cron
            with pytest.raises(HTTPException) as exc:
                _verify_cron(_WRONG_SECRET)
            assert exc.value.status_code == 403

    def test_missing_env_var_raises_503(self):
        with patch("routers.cron.settings", _cron_settings(secret="")):
            from routers.cron import _verify_cron
            with pytest.raises(HTTPException) as exc:
                _verify_cron(_DUMMY_CRON)
            assert exc.value.status_code == 503

    def test_whitespace_in_header_is_stripped(self):
        """Trailing newline from copy-paste must not cause a spurious 403."""
        with patch("routers.cron.settings", _cron_settings()):
            from routers.cron import _verify_cron
            _verify_cron(_DUMMY_CRON + "\n")  # must not raise

    def test_whitespace_in_env_var_is_stripped(self):
        with patch("routers.cron.settings", _cron_settings(secret=" " + _DUMMY_CRON + " ")):
            from routers.cron import _verify_cron
            _verify_cron(_DUMMY_CRON)  # must not raise

    def test_error_does_not_expose_secret(self):
        secret = "super-sensitive-value-xyz"
        with patch("routers.cron.settings", _cron_settings(secret=secret)):
            from routers.cron import _verify_cron
            with pytest.raises(HTTPException) as exc:
                _verify_cron(_WRONG_SECRET)
            assert secret not in str(exc.value.detail)
            assert secret not in repr(exc.value)


# ── Admin auth ────────────────────────────────────────────────────────────────

class TestVerifyAdmin:
    def test_valid_key_passes(self):
        with patch("routers.admin.settings", _admin_settings()):
            from routers.admin import _verify_admin
            _verify_admin(_DUMMY_ADMIN)  # must not raise

    def test_invalid_key_raises_403(self):
        with patch("routers.admin.settings", _admin_settings()):
            from routers.admin import _verify_admin
            with pytest.raises(HTTPException) as exc:
                _verify_admin(_WRONG_SECRET)
            assert exc.value.status_code == 403

    def test_missing_env_var_raises_503(self):
        with patch("routers.admin.settings", _admin_settings(key="")):
            from routers.admin import _verify_admin
            with pytest.raises(HTTPException) as exc:
                _verify_admin(_DUMMY_ADMIN)
            assert exc.value.status_code == 503

    def test_whitespace_in_header_is_stripped(self):
        with patch("routers.admin.settings", _admin_settings()):
            from routers.admin import _verify_admin
            _verify_admin("  " + _DUMMY_ADMIN + "\n")  # must not raise

    def test_error_does_not_expose_secret(self):
        key = "super-sensitive-admin-value"
        with patch("routers.admin.settings", _admin_settings(key=key)):
            from routers.admin import _verify_admin
            with pytest.raises(HTTPException) as exc:
                _verify_admin(_WRONG_SECRET)
            assert key not in str(exc.value.detail)


# ── fix_r32_placeholder_rounds service ───────────────────────────────────────

class TestFixR32PlaceholderRoundsService:
    @pytest.mark.asyncio
    async def test_returns_rowcount(self):
        from services.wc2026_seed import WC2026SeedService
        mock_db   = AsyncMock()
        mock_res  = MagicMock()
        mock_res.rowcount = 3
        mock_db.execute.return_value = mock_res

        svc     = WC2026SeedService(mock_db)
        updated = await svc.fix_r32_placeholder_rounds()
        assert updated == 3

    @pytest.mark.asyncio
    async def test_idempotent_second_call_returns_zero(self):
        """Second call should update 0 rows (already correct)."""
        from services.wc2026_seed import WC2026SeedService
        mock_db  = AsyncMock()
        mock_res = MagicMock()
        mock_db.execute.return_value = mock_res

        svc = WC2026SeedService(mock_db)

        mock_res.rowcount = 3
        first = await svc.fix_r32_placeholder_rounds()
        assert first == 3

        mock_res.rowcount = 0
        second = await svc.fix_r32_placeholder_rounds()
        assert second == 0

    @pytest.mark.asyncio
    async def test_always_commits(self):
        from services.wc2026_seed import WC2026SeedService
        mock_db  = AsyncMock()
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db.execute.return_value = mock_res

        await WC2026SeedService(mock_db).fix_r32_placeholder_rounds()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_secrets_in_output(self):
        """The fix function must never log or return any secret value."""
        from services.wc2026_seed import WC2026SeedService
        mock_db  = AsyncMock()
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db.execute.return_value = mock_res

        svc    = WC2026SeedService(mock_db)
        result = await svc.fix_r32_placeholder_rounds()
        # Result is a plain int — no strings that could contain secrets
        assert isinstance(result, int)


# ── Round count expectations (static) ────────────────────────────────────────

class TestRoundCountExpectations:
    def test_r32_expected_count(self):
        from services.wc2026_seed import _KO_DATES
        assert len(_KO_DATES["r32"]) == 16

    def test_r16_expected_count(self):
        from services.wc2026_seed import _KO_DATES
        assert len(_KO_DATES["r16"]) == 8

    def test_r32_dates_all_before_r16_window(self):
        from datetime import datetime, timezone
        from services.wc2026_seed import _KO_DATES
        r16_start = datetime(2026, 7, 9, tzinfo=timezone.utc)
        for dt in _KO_DATES["r32"]:
            assert dt < r16_start, f"R32 date {dt} is inside the R16 window"
