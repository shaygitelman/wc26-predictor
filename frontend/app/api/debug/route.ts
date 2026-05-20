import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/session'

export async function GET() {
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
