const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// GET /api/tournament/teams — all 48 WC2026 teams, no auth required
export async function GET() {
  const res = await fetch(`${API_BASE}/tournament/teams`, {
    next: { revalidate: 86400 }, // teams don't change — cache 24h
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
