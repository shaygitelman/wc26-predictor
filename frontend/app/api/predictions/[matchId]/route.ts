import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'
import * as Sentry from '@sentry/nextjs'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ matchId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { matchId } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const res = await fetch(`${API_BASE}/predictions/${matchId}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    })
    const data = await res.json().catch(() => ({}))
    return Response.json(data, { status: res.status })
  } catch (err) {
    console.error('[predictions] GET network error match=%s', matchId, err)
    Sentry.captureException(err, { extra: { matchId } })
    return Response.json({ error: 'Could not reach server. Please try again.' }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: Params) {
  const { matchId } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { predictedHome, predictedAway } = await req.json()

  try {
    const res = await fetch(`${API_BASE}/predictions/${matchId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ predicted_home: predictedHome, predicted_away: predictedAway }),
      cache: 'no-store',
    })
    const data = await res.json()
    if (res.ok) {
      console.log('[predictions] saved match=%s home=%d away=%d', matchId, predictedHome, predictedAway)
    } else {
      console.error('[predictions] save failed match=%s status=%d', matchId, res.status, data)
      if (res.status >= 500) {
        Sentry.captureException(new Error(`Prediction save failed: ${res.status}`), {
          extra: { matchId, status: res.status, body: data },
        })
      }
    }
    return Response.json(data, { status: res.status })
  } catch (err) {
    console.error('[predictions] network error match=%s', matchId, err)
    Sentry.captureException(err, { extra: { matchId } })
    return Response.json({ error: 'Could not reach server. Please try again.' }, { status: 502 })
  }
}
