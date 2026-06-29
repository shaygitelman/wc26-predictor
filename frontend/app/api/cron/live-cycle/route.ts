/**
 * Combined live-cycle cron endpoint.
 * Called every minute by cron-job.org — single URL, single secret.
 *
 * Order:
 *   1. reconcile-knockouts  (non-fatal)
 *   2. sync-live
 *   3. /admin/live-status snapshot  (non-fatal, needs ADMIN_KEY env var)
 *
 * Always returns HTTP 200 so cron-job.org doesn't page on expected skips.
 *
 * "updated_matches" merges live + post_ft + near_kickoff and filters to
 * entries updated within the last 2 minutes — telling you exactly which
 * match moved even when its status is "finished" (post-FT window) rather
 * than "live".
 */
import * as Sentry from '@sentry/nextjs'
import { NextRequest, NextResponse } from 'next/server'

export const runtime    = 'nodejs'
export const maxDuration = 58

const CRON_SECRET = process.env.CRON_SECRET
const ADMIN_KEY   = process.env.ADMIN_KEY
const BACKEND_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function isAuthorized(req: NextRequest): boolean {
  const auth   = req.headers.get('authorization')
  const secret = req.headers.get('x-cron-secret')
  if (CRON_SECRET && auth   === `Bearer ${CRON_SECRET}`) return true
  if (CRON_SECRET && secret === CRON_SECRET)             return true
  return false
}

interface BackendResult {
  ok:         boolean
  httpStatus: number
  elapsed:    number
  data:       Record<string, unknown> | null
  error?:     string
}

async function callBackend(
  path:      string,
  method:    'GET' | 'POST',
  headers:   Record<string, string>,
  timeoutMs: number,
): Promise<BackendResult> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const elapsed = Date.now() - t0
    let data: Record<string, unknown> | null = null
    try { data = await res.json() } catch { /* non-JSON body */ }
    return { ok: res.ok, httpStatus: res.status, elapsed, data }
  } catch (err) {
    return { ok: false, httpStatus: 0, elapsed: Date.now() - t0, data: null, error: String(err) }
  }
}

// Subset of admin match fields we care about
interface AdminMatch {
  id?:              string
  external_id?:     string
  match?:           string
  round?:           string
  status?:          string
  period?:          string
  provider_status?: string
  minute?:          number | null
  score?:           string | null
  sync_source?:     string | null
  scheduled_at?:    string
  updated_at?:      string
  mins_since_update?: number
}

interface AdminData {
  now?:                        string
  last_polling_mode?:          string
  api_calls_today?:            number
  api_calls_today_date?:       string
  last_sync_at?:               string | null
  last_sync_records_affected?: number
  last_sync_errors?:           string[]
  last_ko_reconcile_at?:       string | null
  db_last_sync?:               Record<string, unknown>
  live_matches?:               AdminMatch[]
  near_kickoff_matches?:       AdminMatch[]
  post_ft_matches?:            AdminMatch[]
}

function fmtMatch(m: AdminMatch, bucket: string) {
  return {
    bucket,
    match:             m.match,
    id:                m.id,
    external_id:       m.external_id,
    round:             m.round,
    status:            m.status,
    period:            m.period,
    provider_status:   m.provider_status,
    minute:            m.minute,
    score:             m.score,
    sync_source:       m.sync_source,
    updated_at:        m.updated_at,
    mins_since_update: m.mins_since_update,
    scheduled_at:      m.scheduled_at,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cycleStart = Date.now()
  const timestamp  = new Date().toISOString()
  const cronHdr    = { 'X-Cron-Secret': CRON_SECRET ?? '' }

  // ── 1. Reconcile knockout slots (non-fatal) ─────────────────
  const reconcile = await callBackend('/cron/reconcile-knockouts', 'POST', cronHdr, 25_000)

  // ── 2. Sync live matches ────────────────────────────────────
  const sync = await callBackend('/cron/sync-live', 'POST', cronHdr, 45_000)

  // ── 3. Admin snapshot for current state (non-fatal) ─────────
  let adminSnap: BackendResult | null = null
  let adminSkipReason: string | null  = null

  if (!ADMIN_KEY) {
    adminSkipReason = 'ADMIN_KEY env var not set on Vercel'
  } else {
    adminSnap = await callBackend(
      '/admin/live-status', 'GET', { 'X-Admin-Key': ADMIN_KEY }, 8_000,
    )
    if (!adminSnap.ok) {
      adminSkipReason = adminSnap.error
        ?? `HTTP ${adminSnap.httpStatus}: ${JSON.stringify(adminSnap.data)}`
    }
  }

  const elapsed   = Date.now() - cycleStart
  const syncData  = sync.data  as { status?: string; records_affected?: number; errors?: string[] } | null
  const liveState = (adminSnap?.ok ? adminSnap.data : null) as AdminData | null

  // ── Compute update context ──────────────────────────────────
  const liveMatches    = liveState?.live_matches        ?? []
  const postFtMatches  = liveState?.post_ft_matches     ?? []
  const nearKickoff    = liveState?.near_kickoff_matches ?? []

  // All matches visible in any bucket, most-recently-updated first
  const allMatches = [
    ...liveMatches.map(m  => fmtMatch(m,  'live')),
    ...postFtMatches.map(m => fmtMatch(m,  'post_ft')),
    ...nearKickoff.map(m   => fmtMatch(m,  'near_kickoff')),
  ].sort((a, b) => (a.mins_since_update ?? 99) - (b.mins_since_update ?? 99))

  // Filter to just what changed this cycle (updated within last 2 min)
  const updatedThisCycle = allMatches.filter(
    m => m.mins_since_update != null && m.mins_since_update < 2,
  )

  // Human-readable explanation for why live_matches may be empty
  let updateContext: string | null = null
  if (syncData?.records_affected && syncData.records_affected > 0) {
    if (updatedThisCycle.length > 0) {
      const src = updatedThisCycle[0].sync_source ?? 'unknown'
      const bucket = updatedThisCycle[0].bucket
      const srcMap: Record<string, string> = {
        live_feed:        'live feed (Phase 1)',
        stale_live:       'stale-live recovery (Phase 2)',
        post_ft:          'post-FT score correction (Phase 2.5)',
        stale_scheduled:  'scheduled match correction (Phase 3)',
      }
      updateContext = `${srcMap[src] ?? src} — bucket: ${bucket}`
    } else if (liveState) {
      updateContext = 'updated match fell outside the 2-min window by the time admin snapshot ran'
    } else {
      updateContext = 'ADMIN_KEY unavailable — cannot determine which match was updated'
    }
  } else if (syncData?.status === 'skipped') {
    updateContext = 'no live / imminent / post-FT matches — sync skipped, Football API not called'
  }

  if (!sync.ok) {
    Sentry.captureMessage('live-cycle: sync-live failed', {
      level: sync.httpStatus === 0 ? 'error' : 'warning',
      extra: { httpStatus: sync.httpStatus, error: sync.error, timestamp },
    })
  }

  return NextResponse.json({
    timestamp,
    elapsed_ms: elapsed,

    // ── Sync operations ──────────────────────────────────────
    reconcile: {
      ok:               reconcile.ok,
      http_status:      reconcile.httpStatus,
      elapsed_ms:       reconcile.elapsed,
      status:           reconcile.data?.['status']           ?? (reconcile.error ? 'network_error' : 'unknown'),
      records_affected: reconcile.data?.['records_affected'] ?? 0,
      errors:           reconcile.data?.['errors']           ?? (reconcile.error ? [reconcile.error] : []),
    },

    sync: {
      ok:              sync.ok,
      http_status:     sync.httpStatus,
      elapsed_ms:      sync.elapsed,
      status:          syncData?.status          ?? (sync.error ? 'network_error' : 'unknown'),
      matches_updated: syncData?.records_affected ?? 0,
      errors:          syncData?.errors          ?? (sync.error ? [sync.error] : []),
    },

    // ── Update explanation ───────────────────────────────────
    update_context:    updateContext,

    // ── Matches updated this cycle (< 2 min ago, any bucket) ─
    updated_matches:   updatedThisCycle,

    // ── Full state snapshot from backend ─────────────────────
    polling_mode:      liveState?.last_polling_mode          ?? null,
    api_calls_today:   liveState?.api_calls_today,
    last_sync_at:      liveState?.last_sync_at               ?? null,
    last_ko_reconcile: liveState?.last_ko_reconcile_at       ?? null,
    backend_errors:    liveState?.last_sync_errors           ?? [],

    // All buckets — full detail so nothing is hidden
    live_matches:      liveMatches.map(m  => fmtMatch(m,  'live')),
    post_ft_matches:   postFtMatches.map(m => fmtMatch(m,  'post_ft')),
    near_kickoff:      nearKickoff.map(m   => fmtMatch(m,  'near_kickoff')),

    // ── Admin call metadata (diagnose "unknown" issues) ──────
    admin_snapshot: {
      configured:  !!ADMIN_KEY,
      ok:          adminSnap?.ok ?? false,
      http_status: adminSnap?.httpStatus ?? null,
      elapsed_ms:  adminSnap?.elapsed    ?? null,
      skip_reason: adminSkipReason,
    },
  })
}
