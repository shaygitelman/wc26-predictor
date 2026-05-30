import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function getToken() {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value
}

export async function GET() {
  const token = await getToken()
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return Response.json(data, { status: res.status })
  } catch (err) {
    console.error('[users] GET /me network error', err)
    return Response.json({ error: 'Backend unavailable' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const token = await getToken()
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      revalidatePath('/profile')
    } else {
      console.error('[users] PATCH /me failed status=%d', res.status, data)
    }

    return Response.json(data, { status: res.status })
  } catch (err) {
    console.error('[users] PATCH /me network error', err)
    return Response.json({ error: 'Backend unavailable. Please try again.' }, { status: 503 })
  }
}
