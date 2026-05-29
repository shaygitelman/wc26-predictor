import { cookies } from 'next/headers'
import { SESSION_COOKIE, cookieOptions } from '@/lib/session'

const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'

interface GoogleUserInfo {
  sub:            string
  email:          string
  email_verified: boolean
  name:           string
  picture:        string
}

export async function POST(request: Request) {
  try {
    const { accessToken } = await request.json()
    if (!accessToken) {
      return Response.json({ error: 'Missing access token' }, { status: 400 })
    }

    // 1. Verify the Google access token and fetch verified user info
    const googleRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!googleRes.ok) {
      return Response.json({ error: 'Invalid Google token' }, { status: 401 })
    }

    const googleUser: GoogleUserInfo = await googleRes.json()
    if (!googleUser.email_verified) {
      return Response.json({ error: 'Google email not verified' }, { status: 400 })
    }

    // 2. Persist the user in PostgreSQL via FastAPI and receive a signed JWT
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) throw new Error('API_URL is not configured')

    const backendRes = await fetch(`${apiUrl}/auth/google`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        google_id:  googleUser.sub,
        email:      googleUser.email,
        name:       googleUser.name,
        avatar_url: googleUser.picture,
      }),
    })

    if (!backendRes.ok) {
      const detail = await backendRes.json().catch(() => ({}))
      console.error('FastAPI /auth/google failed:', detail)
      return Response.json({ error: 'Failed to create user account' }, { status: 502 })
    }

    const { user, access_token } = await backendRes.json()
    console.log('[auth] sign_in user=%s', user.id ?? user.sub ?? 'unknown')

    // 3. Store the FastAPI JWT directly as the session cookie.
    //    The proxy and /api/auth/me both verify it with the shared JWT_SECRET.
    const isDev = process.env.NODE_ENV !== 'production'
    const store = await cookies()
    store.set(SESSION_COOKIE, access_token, cookieOptions(isDev))

    return Response.json({ user })
  } catch (err) {
    console.error('Auth route error:', err)
    return Response.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
