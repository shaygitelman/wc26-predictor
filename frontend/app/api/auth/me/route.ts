import { cookies } from 'next/headers'
import { decrypt, SESSION_COOKIE } from '@/lib/session'

export async function GET() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (!token) {
    return Response.json({ user: null }, { status: 401 })
  }

  const payload = await decrypt(token)
  if (!payload) {
    return Response.json({ user: null }, { status: 401 })
  }

  return Response.json({
    user: {
      sub:      payload.sub,
      email:    payload.email,
      username: payload.username,
      name:     payload.name,
      picture:  payload.picture,
    },
  })
}
