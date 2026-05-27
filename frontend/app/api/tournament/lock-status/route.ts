const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** Public — no auth. Returns { isLocked: boolean, lockTime: string }. */
export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/tournament/lock-status`, {
      next: { revalidate: 60 },  // cache 60s — lock time changes at most once ever
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch {
    return Response.json({ error: 'Unable to fetch lock status' }, { status: 502 })
  }
}
