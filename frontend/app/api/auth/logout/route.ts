import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  return Response.json({ ok: true })
}
