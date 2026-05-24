import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/session'

// Admin-only diagnostic endpoint. Requires the X-Admin-Key header to match
// the ADMIN_KEY env var. Returns 403 without a valid key so JWT metadata is
// never exposed to unauthenticated callers.
export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey || req.headers.get('x-admin-key') !== adminKey) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = process.env.JWT_SECRET
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  let jwtResult = 'no token'
  if (token) {
    try {
      await jwtVerify(new TextEncoder().encode(token) as any, new TextEncoder().encode(secret ?? ''))
      jwtResult = 'valid'
    } catch (e: any) {
      jwtResult = 'invalid: ' + e.message
    }
  }

  return Response.json({
    jwt_secret_set: !!secret,
    jwt_secret_length: secret?.length ?? 0,
    token_present: !!token,
    token_length: token?.length ?? 0,
    jwt_result: jwtResult,
  })
}
