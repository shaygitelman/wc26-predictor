export async function GET() {
  return Response.json({
    backend_url: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '(not set)',
  })
}
