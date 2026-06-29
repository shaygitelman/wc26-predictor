/**
 * Combined live-cycle cron endpoint.
 * Called every minute by cron-job.org — single URL, single secret.
 *
 * Runs in order:
 *   1. reconcile-knockouts  (non-fatal)
 *   2. sync-live
 *   3. Fetches /admin/live-status for a current-state snapshot (non-fatal)
 *
 * Always returns HTTP 200 so cron-job.org doesn't alert on expected skips.
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

  // ── 3. Snapshot current state for logging (non-fatal) ───────
  const adminSnap = ADMIN_KEY
    ? await callBackend('/admin/live-status', 'GET', { 'X-Admin-Key': ADMIN_KEY }, 5_000)
    : null

  const elapsed = Date.now() - cycleStart

  type SyncData = { status?: string; records_affected?: number; errors?: string[] }
  type LiveMatch = {
    match?: string; minute?: number; period?: string; status?: string
    score?: string; sync_source?: string; mins_since_update?: number
  }
  type AdminData = {
    last_polling_mode?: string
    api_calls_today?: number
    live_matches?: LiveMatch[]
    near_kickoff_matches?: unknown[]
    post_ft_matches?: unknown[]
    last_sync_errors?: string[]
  }

  const syncData  = sync.data      as SyncData  | null
  const liveState = adminSnap?.data as AdminData | null

  if (!sync.ok) {
    Sentry.captureMessage('live-cycle: sync-live failed', {
      level: sync.httpStatus === 0 ? 'error' : 'warning',
      extra: { httpStatus: sync.httpStatus, error: sync.error, timestamp },
    })
  }

  return NextResponse.json({
    timestamp,
    elapsed_ms: elapsed,

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

    polling_mode:       liveState?.last_polling_mode ?? 'unknown',
    api_calls_today:    liveState?.api_calls_today,
    live_matches:       (liveState?.live_matches ?? []).map(m => ({
      match:             m.match,
      minute:            m.minute,
      period:            m.period,
      score:             m.score,
      sync_source:       m.sync_source,
      mins_since_update: m.mins_since_update,
    })),
    near_kickoff_count: liveState?.near_kickoff_matches?.length ?? 0,
    post_ft_count:      liveState?.post_ft_matches?.length      ?? 0,
    last_sync_errors:   liveState?.last_sync_errors             ?? [],
  })
}
