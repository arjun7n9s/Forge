export function GET(): Response {
  return Response.json({ service: 'forge-enrich', status: 'ok' }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
