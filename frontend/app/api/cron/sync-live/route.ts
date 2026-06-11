import * as Sentry from '@sentry/nextjs'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 55

const CRON_SECRET  = process.env.CRON_SECRET   // set in Vercel env vars (server-only)
const BACKEND_URL  = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function isAuthorized(req: NextRequest): boolean {
  // Vercel sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true
  // UptimeRobot / manual fallback
  const secretHeader = req.headers.get('x-cron-secret')
  if (CRON_SECRET && secretHeader === CRON_SECRET) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()

  try {
    const res = await fetch(`${BACKEND_URL}/cron/sync-live`, {
      method:  'POST',
      headers: { 'X-Cron-Secret': CRON_SECRET ?? '' },
      signal:  AbortSignal.timeout(45_000),
    })

    const elapsed = Date.now() - started

    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)')
      Sentry.captureMessage(`sync-live backend error ${res.status}`, {
        level: 'error',
        extra: { status: res.status, body, elapsed },
      })
      return NextResponse.json(
        { error: 'backend_error', status: res.status, elapsed },
        { status: 502 },
      )
    }

    const data = await res.json() as {
      status:           string
      records_affected: number
      errors?:          string[]
    }

    if (data.status === 'error' || data.errors?.length) {
      Sentry.captureMessage('sync-live completed with errors', {
        level: data.status === 'error' ? 'error' : 'warning',
        extra: { syncStatus: data.status, errors: data.errors, records_affected: data.records_affected, elapsed },
      })
    }

    // skipped = no live/imminent matches; success/partial are both fine
    return NextResponse.json({
      ok:               data.status !== 'error',
      status:           data.status,
      records_affected: data.records_affected,
      elapsed,
    })
  } catch (err) {
    const elapsed = Date.now() - started
    Sentry.captureException(err, { extra: { elapsed } })
    return NextResponse.json({ error: 'fetch_failed', elapsed }, { status: 500 })
  }
}
