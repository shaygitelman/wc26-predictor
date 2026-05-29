const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET() {
  // Short revalidate so a newly seeded/synced player appears within 60s.
  const res = await fetch(`${API_BASE}/players/favorites`, {
    next: { revalidate: 60 },
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
