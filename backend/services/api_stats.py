"""
In-process API usage statistics.

Tracks daily API-Football request counts (resets at midnight) and
lifetime cache hit/miss rates (since last server restart).

All functions are synchronous and GIL-safe for use in async context.
"""
import datetime
import logging
from collections import defaultdict

log = logging.getLogger(__name__)

DAILY_LIMIT      = 7500
_WARN_THRESHOLDS = (0.70, 0.85, 0.95)

# ── Daily counters (reset each UTC midnight) ─────────────────────────
_day:         str            = ""
_call_count:  int            = 0
_by_endpoint: dict[str, int] = defaultdict(int)

# ── Lifetime cache counters (reset on server restart) ────────────────
_cache_hits:   dict[str, int] = defaultdict(int)
_cache_misses: dict[str, int] = defaultdict(int)


def _reset_if_new_day() -> None:
    global _day, _call_count, _by_endpoint
    today = datetime.date.today().isoformat()
    if _day != today:
        if _day:
            log.info("[APIStats] new UTC day — resetting daily counters (yesterday: %d calls)", _call_count)
        _call_count  = 0
        _by_endpoint = defaultdict(int)
        _day         = today


def record_api_call(path: str) -> None:
    """Called by ApiFootballProvider._get() after every successful response."""
    global _call_count
    _reset_if_new_day()
    _call_count += 1
    _by_endpoint[path] += 1
    pct = _call_count / DAILY_LIMIT
    for threshold in _WARN_THRESHOLDS:
        if _call_count == int(threshold * DAILY_LIMIT):
            log.warning(
                "API-Football daily usage: %d/%d (%.0f%%) — %d%% threshold reached",
                _call_count, DAILY_LIMIT, pct * 100, int(threshold * 100),
            )


def record_cache_hit(name: str) -> None:
    _cache_hits[name] += 1


def record_cache_miss(name: str) -> None:
    _cache_misses[name] += 1


def get_stats() -> dict:
    """Return a snapshot of current API usage and cache performance."""
    _reset_if_new_day()

    top_consumers = sorted(
        [{"endpoint": k, "calls": v} for k, v in _by_endpoint.items()],
        key=lambda x: x["calls"],
        reverse=True,
    )

    cache_stats: dict[str, dict] = {}
    for name in sorted(set(list(_cache_hits) + list(_cache_misses))):
        hits   = _cache_hits[name]
        misses = _cache_misses[name]
        total  = hits + misses
        cache_stats[name] = {
            "hits":         hits,
            "misses":       misses,
            "hit_rate_pct": round(hits / total * 100, 1) if total else None,
        }

    return {
        "date":            _day,
        "requests_today":  _call_count,
        "daily_limit":     DAILY_LIMIT,
        "quota_pct":       round(_call_count / DAILY_LIMIT * 100, 2),
        "quota_remaining": DAILY_LIMIT - _call_count,
        "top_consumers":   top_consumers,
        "cache_stats":     cache_stats,
        "note":            "cache stats are lifetime (since last server restart); daily counters reset at UTC midnight",
    }
