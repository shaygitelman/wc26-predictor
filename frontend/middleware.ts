import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'matchpoint26-session'

// Routes that are accessible without a session
const PUBLIC_PATHS = ['/login', '/register']

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return false

  const secret = process.env.JWT_SECRET
  // If the secret isn't available fall back to cookie-presence-only so we
  // don't lock everyone out in a misconfigured environment.
  if (!secret) {
    console.warn('[middleware] JWT_SECRET not set — falling back to cookie-presence check')
    return true
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const valid    = await hasValidSession(request)

  if (!valid && !isPublic) {
    // No valid session — redirect to login before any protected page renders.
    // Preserve the full destination (pathname + query string) so the user
    // lands back at the exact URL after signing in.
    const url = new URL('/login', request.url)
    const dest = pathname + (search || '')
    if (dest !== '/') url.searchParams.set('next', dest)
    return NextResponse.redirect(url)
  }

  if (valid && isPublic) {
    // Already authenticated — honour the ?next= param if present (e.g. a
    // shared login?next=/join/ABC link); otherwise send to home.
    const next = request.nextUrl.searchParams.get('next')
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    return NextResponse.redirect(new URL(safe, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     *   - _next/static  (webpack bundles, CSS, etc.)
     *   - _next/image   (image optimisation)
     *   - /api          (API routes handle their own auth)
     *   - static assets (icons, fonts, images, manifests)
     */
    '/((?!_next/static|_next/image|api/|favicon\\.ico|apple-touch-icon|manifest\\.webmanifest|.*\\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4)).*)',
  ],
}
