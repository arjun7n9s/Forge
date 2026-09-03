import { corsHeaders, personalOrigin } from '../../../lib/http/cors.ts'
import { BodyLimitError, SCAN_BODY_LIMIT, readJsonBody } from '../../../lib/http/bodyLimit.ts'
import { logEvent } from '../../../lib/http/log.ts'
import { clientIp, retryAfterSeconds, verificationLimiter } from '../../../lib/http/rateLimit.ts'
import { normalizeDoi } from '../../../lib/doi.ts'
import { verificationService } from '../../../lib/verification.ts'

function headers(request: Request, extra: Record<string, string> = {}): Record<string, string> {
  return { ...corsHeaders(request.headers.get('origin'), personalOrigin()), ...extra }
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: headers(request) })
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request)
  let body: unknown
  try { body = await readJsonBody(request, SCAN_BODY_LIMIT) }
  catch (error) {
    if (error instanceof BodyLimitError) return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413, headers: headers(request) })
    return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers: headers(request) })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ error: 'INVALID_DOIS' }, { status: 400, headers: headers(request) })
  }
  const values = (body as Record<string, unknown>).dois
  if (!Array.isArray(values)) return Response.json({ error: 'INVALID_DOIS' }, { status: 400, headers: headers(request) })
  if (values.length > 50) return Response.json({ error: 'SCAN_LIMIT' }, { status: 400, headers: headers(request) })

  let dois: string[]
  try {
    dois = values.map((value) => {
      if (typeof value !== 'string') throw new Error('INVALID_DOI')
      return normalizeDoi(value)
    })
  } catch {
    return Response.json({ error: 'INVALID_DOI' }, { status: 400, headers: headers(request) })
  }
  const limited = verificationLimiter.checkMany(ip, dois)
  if (!limited.ok) {
    logEvent('rate_limited', { route: '/api/scan', ip, dois, scope: limited.scope })
    return Response.json({ error: 'RATE_LIMITED', scope: limited.scope }, { status: 429, headers: headers(request, { 'Retry-After': retryAfterSeconds(limited.resetAt) }) })
  }
  try {
    const results = await verificationService.scan(dois)
    logEvent('scan.complete', { route: '/api/scan', ip, count: results.length })
    return Response.json({ results }, { headers: headers(request) })
  } catch {
    logEvent('scan.failed', { route: '/api/scan', ip })
    return Response.json({ error: 'SCAN_FAILED' }, { status: 502, headers: headers(request) })
  }
}
