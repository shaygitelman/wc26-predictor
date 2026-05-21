import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from '@/types/auth'

export const SESSION_COOKIE = 'matchpoint26-session'

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function encrypt(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret())
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export function cookieOptions(dev: boolean) {
  return {
    httpOnly:  true,
    sameSite:  'lax'  as const,
    secure:    !dev,
    maxAge:    SESSION_DURATION_SECONDS,
    path:      '/',
  }
}

/** Derive a username from a Google email address. */
export function usernameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24)
}
