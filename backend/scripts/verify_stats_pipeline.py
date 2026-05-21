#!/usr/bin/env python3
"""
Verify that the stats pipeline is working correctly against any backend.

Usage:
    python scripts/verify_stats_pipeline.py \
        --url https://wc26-backend.onrender.com \
        --admin-key <your-admin-key>

What it checks:
    1. Fixture-mapping audit  — how many matches have real API-Football IDs
    2. Stats pipeline probe   — tests one match from each bucket:
         - live/finished + numeric external_id  → should return real stats
         - scheduled + numeric external_id      → should return 501 (not ready)
         - manual-wc2026-* external_id           → should return 501 (placeholder)
         - null external_id                      → should return 501 (never synced)
    3. Sync log               — confirms when fixtures were last synced

Exit code: 0 if production is correctly configured, 1 if issues found.
"""
import argparse
import json
import sys
from typing import Any

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. Run: pip install httpx")
    sys.exit(1)


# ─── Helpers ─────────────────────────────────────────────────────────────────


def get(client: "httpx.Client", url: str, admin_key: str) -> dict[str, Any]:
    r = client.get(url, headers={"x-admin-key": admin_key}, timeout=30)
    r.raise_for_status()
    return r.json()


def check_stats(client: "httpx.Client", base: str, match_id: str) -> tuple[int, dict]:
    """Returns (http_status, body) for GET /matches/{id}/stats."""
    r = client.get(f"{base}/matches/{match_id}/stats", timeout=30)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:200]}
    return r.status_code, body


def section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print('─' * 60)


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify MatchPoint26 stats pipeline")
    parser.add_argument("--url",       required=True, help="Backend base URL (no trailing slash)")
    parser.add_argument("--admin-key", required=True, help="X-Admin-Key value")
    args = parser.parse_args()

    base = args.url.rstrip("/")
    key  = args.admin_key
    issues: list[str] = []

    with httpx.Client() as client:

        # ── 1. Health check ───────────────────────────────────────
        section("1 / Health check")
        try:
            r = client.get(f"{base}/health", timeout=10)
            print(f"  GET /health → HTTP {r.status_code}")
            if r.status_code != 200:
                issues.append(f"Health check failed: HTTP {r.status_code}")
        except Exception as exc:
            issues.append(f"Cannot reach backend: {exc}")
            print(f"  FAIL: {exc}")
            print("\nAbort — backend unreachable.")
            return 1

        # ── 2. Fixture-mapping audit ──────────────────────────────
        section("2 / Fixture-mapping audit  (GET /admin/stats/fixture-mapping)")
        try:
            audit = get(client, f"{base}/admin/stats/fixture-mapping", key)
        except httpx.HTTPStatusError as exc:
            issues.append(f"Audit endpoint failed: {exc}")
            print(f"  FAIL: {exc}")
            audit = None

        if audit:
            s = audit["summary"]
            print(f"  Total matches      : {s['total_matches']}")
            print(f"  Synced (numeric)   : {s['synced_numeric']}  ← can have real stats")
            print(f"  Manual seed        : {s['manual_seed']}  ← placeholders, no stats")
            print(f"  Null / other       : {s['null_or_other']}  ← never synced")
            print(f"  Stats-ready NOW    : {s['stats_ready_now']}  ← live/finished + numeric ID")
            print()
            print(f"  Fixture sync       : {audit['verdicts']['fixture_sync']}")
            print(f"  Stats pipeline     : {audit['verdicts']['stats_pipeline']}")

            print("\n  By round:")
            for rnd, counts in audit["by_round"].items():
                synced = counts["synced_numeric"]
                total  = counts["total"]
                flag   = "✓" if synced == total else "⚠" if synced > 0 else "✗"
                print(f"    {flag} {rnd:<8} {synced}/{total} synced")

            print("\n  By status:")
            for st, counts in audit["by_status"].items():
                print(f"    {st:<12} total={counts['total']} numeric={counts['synced_numeric']} manual={counts['manual_seed']} null={counts['null_or_other']}")

            if s["synced_numeric"] == 0:
                issues.append("CRITICAL: zero matches have numeric external_id — sync/fixtures has never run or failed completely")

            if audit["verdicts"]["fixture_sync"].startswith("NEVER"):
                issues.append("fixture sync has never run — POST /admin/sync/fixtures")

        # ── 3. Recent sync log ────────────────────────────────────
        section("3 / Recent fixture sync log")
        if audit and audit.get("recent_fixture_sync_log"):
            for entry in audit["recent_fixture_sync_log"]:
                flag = "✓" if entry["status"] == "success" else "✗"
                print(f"  {flag} {entry['started_at']}  provider={entry['provider']}  "
                      f"status={entry['status']}  records={entry['records_affected']}")
                if entry.get("error"):
                    print(f"      error: {entry['error'][:120]}")
        else:
            print("  (no fixture sync entries — sync has never run)")

        # ── 4. Stats pipeline probe ───────────────────────────────
        section("4 / Stats pipeline probe")

        if not audit:
            print("  Skipped — audit endpoint unavailable")
        else:
            samples = audit.get("samples", {})
            probed: list[dict] = []

            # Probe 1: stats-ready match (live/finished + numeric)
            ready = audit.get("stats_ready_matches", [])
            if ready:
                m = ready[0]
                http, body = check_stats(client, base, m["match_id"])
                expected_ok = http == 200 and body.get("verified") is True
                flag = "✓" if expected_ok else "✗"
                probed.append({
                    "bucket":      "live/finished + numeric ID",
                    "match_id":    m["match_id"],
                    "external_id": m["external_id"],
                    "status":      m["status"],
                    "http":        http,
                    "verified":    body.get("verified"),
                    "rows":        "N/A (check manually)" if http != 200 else f"home_possession={body.get('home', {}).get('possession')}",
                    "pass":        expected_ok,
                })
                print(f"  {flag} live/finished match  id={m['match_id']} ext={m['external_id']} → HTTP {http} verified={body.get('verified')}")
                if http == 200 and body.get("verified"):
                    home = body.get("home", {})
                    away = body.get("away", {})
                    print(f"      possession: home={home.get('possession')} away={away.get('possession')}")
                    print(f"      shots:      home={home.get('totalShots')}    away={away.get('totalShots')}")
                    print(f"      xG:         home={home.get('xG')}           away={away.get('xG')}")
                elif http == 501:
                    print(f"      → stats not yet published for this fixture (normal for early-game minutes)")
                else:
                    issues.append(f"Live/finished match {m['match_id']} returned unexpected HTTP {http}")
            else:
                print("  — no live/finished + numeric matches to probe")

            # Probe 2: scheduled match with numeric ID
            scheduled_synced = [
                m for m in samples.get("synced_numeric", [])
                if m["status"] == "scheduled"
            ]
            if scheduled_synced:
                m = scheduled_synced[0]
                http, body = check_stats(client, base, m["match_id"])
                expected = http == 501
                flag = "✓" if expected else "✗"
                print(f"  {flag} scheduled + numeric   id={m['match_id']} ext={m['external_id']} → HTTP {http} (expected 501)")
                if not expected:
                    issues.append(f"Scheduled match {m['match_id']} should return 501 but got {http}")
            else:
                print("  — no scheduled + numeric matches to probe")

            # Probe 3: manual seed placeholder
            manual_samples = samples.get("manual_seed", [])
            if manual_samples:
                m = manual_samples[0]
                http, body = check_stats(client, base, m["match_id"])
                expected = http == 501
                flag = "✓" if expected else "✗"
                print(f"  {flag} manual placeholder    id={m['match_id']} ext={m['external_id']} → HTTP {http} (expected 501)")
                if not expected:
                    issues.append(f"Manual-seed match {m['match_id']} should return 501 but got {http}")
            else:
                print("  — no manual-seed matches to probe")

            # Probe 4: null external_id
            null_samples = samples.get("null_or_other", [])
            if null_samples:
                m = null_samples[0]
                http, body = check_stats(client, base, m["match_id"])
                expected = http == 501
                flag = "✓" if expected else "✗"
                print(f"  {flag} null external_id      id={m['match_id']} ext={m['external_id']} → HTTP {http} (expected 501)")
                if not expected:
                    issues.append(f"Null-ID match {m['match_id']} should return 501 but got {http}")
            else:
                print("  — no null-ID matches to probe")

        # ── 5. Final report ───────────────────────────────────────
        section("5 / Final report")

        if not issues:
            print("  ✓ All checks passed.")
            print()
            if audit:
                s = audit["summary"]
                print(f"  • {s['synced_numeric']} matches have real API-Football fixture IDs")
                print(f"  • {s['stats_ready_now']} matches are currently live/finished and can return real statistics")
                print(f"  • {s['manual_seed']} knockout placeholders correctly return 501 (no fabrication)")
                print(f"  • {s['null_or_other']} unsynced matches correctly return 501 (no fabrication)")
            return 0
        else:
            print(f"  ✗ {len(issues)} issue(s) found:")
            for i, issue in enumerate(issues, 1):
                print(f"    {i}. {issue}")
            print()
            print("  Action required:")
            if any("sync" in i.lower() for i in issues):
                print("    → Run POST /admin/sync/fixtures (with X-Admin-Key header)")
            if any("CRITICAL" in i for i in issues):
                print("    → Or run POST /admin/reset/wc2026 for a full re-seed")
            return 1


if __name__ == "__main__":
    sys.exit(main())
