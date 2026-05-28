const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/teams`, { next: { revalidate: 300 } })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch {
    return Response.json({ error: 'Backend unavailable' }, { status: 503 })
  }
}
