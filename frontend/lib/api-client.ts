/**
 * Client-side authenticated fetch wrapper.
 *
 * Registers a global 401 handler so any component can call `apiFetch` and
 * get automatic session-expiry handling without wiring up auth context in
 * every call site.
 *
 * Usage:
 *   import { apiFetch } from '@/lib/api-client'
 *   const res = await apiFetch('/api/leagues', { method: 'GET' })
 *
 * Do NOT use this for:
 *   - /api/auth/me session-check calls (handle 401 explicitly there)
 *   - /api/auth/google login (401 is expected on first call)
 *   - Server Components / Route Handlers (use api-server.ts instead)
 */

type UnauthorizedHandler = () => void

let _onUnauthorized: UnauthorizedHandler | null = null

/**
 * Called once by AuthProvider on mount.  Any subsequent 401 response from
 * apiFetch() will invoke this handler.
 */
export function setOnUnauthorized(fn: UnauthorizedHandler): void {
  _onUnauthorized = fn
}

/**
 * Drop-in replacement for `fetch` on the client side.
 * Intercepts 401 responses and fires the registered unauthorized handler.
 * All other responses (including errors) are returned unchanged so existing
 * per-component error handling continues to work.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    _onUnauthorized?.()
  }
  return res
}
