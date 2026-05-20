import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/matches',
  '/api/teams',
  '/api/players',
  '/api/groups',
  '/_next',
  '/favicon.ico',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (!token) {
    if (isPublic(pathname)) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Cookie exists — trust it here; /api/auth/me does full JWT verification
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)'],
}
