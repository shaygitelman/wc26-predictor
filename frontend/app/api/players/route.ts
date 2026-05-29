const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  // No cache: search results are user-driven and must reflect the live DB.
  // A cached empty result for "kane" would hide players added by sync/seed.
  const res = await fetch(`${API_BASE}/players${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
