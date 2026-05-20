/**
 * Server-side only — safe to import in Server Components and Route Handlers.
 * Reads the httpOnly session cookie and forwards it as a Bearer token.
 * Never import this in Client Components.
 */
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from './session'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type FetchOptions = Omit<RequestInit, 'body'> & {
  auth?: boolean
  body?: unknown
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth = true, body, ...rest } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> ?? {}),
  }

  if (auth) {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status} ${path}: ${text}`)
  }

  return res.json()
}

/** User-specific or frequently-changing data — never cached. */
export function apiGet<T>(path: string, options?: Omit<FetchOptions, 'method'>) {
  return apiFetch<T>(path, { ...options, method: 'GET', cache: 'no-store' })
}

/** Public, infrequently-changing data — cached with ISR. */
export function apiGetCached<T>(path: string, revalidateSeconds = 60, options?: Omit<FetchOptions, 'method'>) {
  return apiFetch<T>(path, { ...options, method: 'GET', next: { revalidate: revalidateSeconds } })
}

export function apiPost<T>(path: string, body: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) {
  return apiFetch<T>(path, { ...options, method: 'POST', body, cache: 'no-store' })
}

export function apiPut<T>(path: string, body: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) {
  return apiFetch<T>(path, { ...options, method: 'PUT', body, cache: 'no-store' })
}
