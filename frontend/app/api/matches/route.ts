const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const url = `${API_BASE}/matches${qs ? `?${qs}` : ''}`

  const res = await fetch(url, { next: { revalidate: 30 } })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
