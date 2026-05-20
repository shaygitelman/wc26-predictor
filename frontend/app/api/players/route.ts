const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const res = await fetch(`${API_BASE}/players${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 3600 },  // player rosters rarely change; cache 1 hour
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
