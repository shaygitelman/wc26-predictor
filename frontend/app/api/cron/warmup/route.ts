import { NextRequest, NextResponse } from 'next/server'

export const runtime    = 'nodejs'
export const maxDuration = 15

const CRON_SECRET = process.env.CRON_SECRET
const BACKEND_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true
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
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(10_000),
    })
    const elapsed = Date.now() - started
    const body = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, status: body.status ?? res.status, elapsed })
  } catch {
    const elapsed = Date.now() - started
    return NextResponse.json({ ok: false, error: 'unreachable', elapsed }, { status: 502 })
  }
}
