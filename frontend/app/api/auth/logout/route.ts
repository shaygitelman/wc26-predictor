import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST() {
  const store = await cookies()
  const isDev = process.env.NODE_ENV !== 'production'
  // Mirror the exact attributes used when the cookie was set so every browser
  // reliably deletes it (some require matching Secure/SameSite to overwrite).
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure:   !isDev,
    maxAge:   0,
    path:     '/',
  })
  return Response.json({ ok: true })
}
