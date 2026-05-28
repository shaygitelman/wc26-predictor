const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET() {
  const res = await fetch(`${API_BASE}/players/favorites`, {
    next: { revalidate: 3600 },
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
