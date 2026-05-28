const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// GET /api/leagues/preview/[code] — public, no auth required
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const res = await fetch(`${API_BASE}/leagues/preview/${encodeURIComponent(code.toUpperCase())}`, {
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
