const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function GET() {
  const res = await fetch(`${API_BASE}/teams`, { next: { revalidate: 300 } })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
