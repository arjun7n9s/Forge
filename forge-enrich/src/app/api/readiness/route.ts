export function GET(): Response {
  return Response.json({
    service: 'forge-enrich',
    status: 'ready',
    upstream: 'not_probed',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
