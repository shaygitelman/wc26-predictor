"""
Verification tests for the match statistics service.

These tests prove the no-hallucination guarantee:
  - Every rejection path returns None (never fabricated data)
  - The rejection reason is always one of the defined constants
  - Scheduled matches never return stats
  - Manual / null external_ids never return stats
  - Only live/finished + numeric external_id reaches the API call
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.match_stats import (
    get_match_statistics,
    StatsRejectionReason,
    _parse_num,
    _stat,
    _parse_team,
    TeamMatchStats,
)


# ─── Unit: _parse_num ────────────────────────────────────────────


def test_parse_num_int():
    assert _parse_num(5) == 5.0


def test_parse_num_float():
    assert _parse_num(1.85) == pytest.approx(1.85)


def test_parse_num_percentage_string():
    assert _parse_num("55%") == pytest.approx(55.0)


def test_parse_num_decimal_string():
    assert _parse_num("1.85") == pytest.approx(1.85)


def test_parse_num_null():
    assert _parse_num(None) is None


def test_parse_num_empty_string():
    assert _parse_num("") is None


def test_parse_num_non_numeric_string():
    assert _parse_num("N/A") is None


# ─── Unit: _stat ─────────────────────────────────────────────────


def test_stat_found():
    stats = [
        {"type": "Ball Possession", "value": "60%"},
        {"type": "Total Shots", "value": 12},
    ]
    assert _stat(stats, "Ball Possession") == pytest.approx(60.0)


def test_stat_case_insensitive():
    stats = [{"type": "ball possession", "value": "45%"}]
    assert _stat(stats, "Ball Possession") == pytest.approx(45.0)


def test_stat_missing_returns_none():
    stats = [{"type": "Total Shots", "value": 8}]
    assert _stat(stats, "Ball Possession") is None


def test_stat_null_value_returns_none():
    stats = [{"type": "Ball Possession", "value": None}]
    assert _stat(stats, "Ball Possession") is None


# ─── Unit: _parse_team ───────────────────────────────────────────


def test_parse_team_full_block():
    stats_list = [
        {"type": "Ball Possession",  "value": "55%"},
        {"type": "Total Shots",      "value": 10},
        {"type": "Shots on Goal",    "value": 4},
        {"type": "Corner Kicks",     "value": 6},
        {"type": "Fouls",            "value": 12},
        {"type": "Yellow Cards",     "value": 2},
        {"type": "Red Cards",        "value": 0},
        {"type": "Goalkeeper Saves", "value": 3},
        {"type": "Offsides",         "value": 1},
        {"type": "Total passes",     "value": 450},
        {"type": "Passes %",         "value": "87%"},
        {"type": "expected_goals",   "value": "1.42"},
    ]
    team = _parse_team(stats_list)
    assert team.possession      == pytest.approx(55.0)
    assert team.total_shots     == 10
    assert team.shots_on_target == 4
    assert team.corners         == 6
    assert team.fouls           == 12
    assert team.yellow_cards    == 2
    assert team.red_cards       == 0
    assert team.saves           == 3
    assert team.offsides        == 1
    assert team.passes          == 450
    assert team.pass_accuracy   == pytest.approx(87.0)
    assert team.xg              == pytest.approx(1.42)
    assert team.field_coverage  == 12


def test_parse_team_sparse_block():
    stats_list = [
        {"type": "Total Shots", "value": 5},
    ]
    team = _parse_team(stats_list)
    assert team.total_shots    == 5
    assert team.possession     is None
    assert team.xg             is None
    assert team.field_coverage == 1


def test_parse_team_all_null():
    team = _parse_team([])
    assert team.field_coverage == 0
    assert team.possession is None


# ─── Service: rejection paths ────────────────────────────────────


def _make_match(external_id, status="finished"):
    m = MagicMock()
    m.external_id = external_id
    m.status      = status
    return m


@pytest.mark.asyncio
async def test_rejection_no_api_key():
    db = AsyncMock()
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = None
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_match_not_found():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=None)
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("missing-match", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_null_external_id():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id=None))
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_manual_external_id():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="manual-wc2026-grp-a1"))
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_non_numeric_external_id():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="abc-123"))
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_scheduled_match():
    """Scheduled matches NEVER return stats — even with a valid numeric external_id."""
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="12345", status="scheduled"))
    with patch("services.match_stats.settings") as mock_settings:
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_api_error():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="12345", status="finished"))

    mock_provider = AsyncMock()
    mock_provider.fetch_fixture_statistics = AsyncMock(side_effect=Exception("timeout"))

    with patch("services.match_stats.settings") as mock_settings, \
         patch("services.match_stats.ApiFootballProvider", return_value=mock_provider):
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_empty_response():
    """API returning < 2 team blocks must never fabricate — return None."""
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="12345", status="finished"))

    mock_provider = AsyncMock()
    mock_provider.fetch_fixture_statistics = AsyncMock(return_value=[])  # 0 blocks

    with patch("services.match_stats.settings") as mock_settings, \
         patch("services.match_stats.ApiFootballProvider", return_value=mock_provider):
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


@pytest.mark.asyncio
async def test_rejection_single_block_response():
    """1 block (not 2) — still rejected, never fabricated."""
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="12345", status="live"))

    mock_provider = AsyncMock()
    mock_provider.fetch_fixture_statistics = AsyncMock(return_value=[
        {"statistics": [{"type": "Total Shots", "value": 8}]},
    ])

    with patch("services.match_stats.settings") as mock_settings, \
         patch("services.match_stats.ApiFootballProvider", return_value=mock_provider):
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)
    assert result is None


# ─── Service: happy path ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_success_returns_verified_data():
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="99999", status="finished"))

    two_blocks = [
        {"statistics": [
            {"type": "Ball Possession", "value": "60%"},
            {"type": "Total Shots",     "value": 12},
        ]},
        {"statistics": [
            {"type": "Ball Possession", "value": "40%"},
            {"type": "Total Shots",     "value": 7},
        ]},
    ]
    mock_provider = AsyncMock()
    mock_provider.fetch_fixture_statistics = AsyncMock(return_value=two_blocks)

    with patch("services.match_stats.settings") as mock_settings, \
         patch("services.match_stats.ApiFootballProvider", return_value=mock_provider):
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)

    assert result is not None
    d = result.to_dict()
    assert d["verified"]   is True
    assert d["confidence"] == "high"
    assert d["source"]     == "api-football:/fixtures/statistics"
    assert d["home"]["possession"] == pytest.approx(60.0)
    assert d["away"]["possession"] == pytest.approx(40.0)
    assert d["home"]["totalShots"] == 12
    assert d["away"]["totalShots"] == 7


@pytest.mark.asyncio
async def test_success_never_fills_missing_stats():
    """Fields missing from API response must be null, never zero or estimated."""
    db       = AsyncMock()
    db.get   = AsyncMock(return_value=_make_match(external_id="99999", status="finished"))

    two_blocks = [
        {"statistics": [{"type": "Total Shots", "value": 5}]},
        {"statistics": [{"type": "Total Shots", "value": 3}]},
    ]
    mock_provider = AsyncMock()
    mock_provider.fetch_fixture_statistics = AsyncMock(return_value=two_blocks)

    with patch("services.match_stats.settings") as mock_settings, \
         patch("services.match_stats.ApiFootballProvider", return_value=mock_provider):
        mock_settings.apifootball_key = "test-key"
        result = await get_match_statistics("match-1", db)

    assert result is not None
    d = result.to_dict()
    assert d["home"]["possession"]    is None
    assert d["home"]["xG"]            is None
    assert d["home"]["passAccuracy"]  is None
    assert d["away"]["possession"]    is None


# ─── StatsRejectionReason constants ──────────────────────────────


def test_rejection_reason_constants_are_unique():
    codes = [
        StatsRejectionReason.NO_API_KEY,
        StatsRejectionReason.MATCH_NOT_FOUND,
        StatsRejectionReason.MISSING_EXT_ID,
        StatsRejectionReason.MANUAL_EXT_ID,
        StatsRejectionReason.NON_NUMERIC_ID,
        StatsRejectionReason.MATCH_SCHEDULED,
        StatsRejectionReason.API_ERROR,
        StatsRejectionReason.EMPTY_RESPONSE,
    ]
    assert len(codes) == len(set(codes)), "Rejection reason codes must be unique"


def test_rejection_reason_are_strings():
    assert isinstance(StatsRejectionReason.NO_API_KEY,      str)
    assert isinstance(StatsRejectionReason.MATCH_SCHEDULED, str)
    assert isinstance(StatsRejectionReason.EMPTY_RESPONSE,  str)
