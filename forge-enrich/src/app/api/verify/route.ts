import { corsHeaders, personalOrigin } from '../../../lib/http/cors.ts'
import { BodyLimitError, VERIFY_BODY_LIMIT, readJsonBody } from '../../../lib/http/bodyLimit.ts'
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
  try { body = await readJsonBody(request, VERIFY_BODY_LIMIT) }
  catch (error) {
    if (error instanceof BodyLimitError) return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413, headers: headers(request) })
    return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers: headers(request) })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body) || typeof (body as Record<string, unknown>).doi !== 'string') {
    return Response.json({ error: 'INVALID_DOI' }, { status: 400, headers: headers(request) })
  }
  let doi: string
  try { doi = normalizeDoi((body as Record<string, unknown>).doi as string) } catch {
    return Response.json({ error: 'INVALID_DOI' }, { status: 400, headers: headers(request) })
  }
  const limited = verificationLimiter.check(ip, doi)
  if (!limited.ok) {
    logEvent('rate_limited', { route: '/api/verify', ip, doi, scope: limited.scope })
    return Response.json({ error: 'RATE_LIMITED', scope: limited.scope }, { status: 429, headers: headers(request, { 'Retry-After': retryAfterSeconds(limited.resetAt) }) })
  }
  try {
    const result = await verificationService.verify(doi)
    logEvent('verify.complete', { route: '/api/verify', ip, status: result.status, cache: result.cache.state })
    return Response.json(result, { headers: headers(request) })
  } catch {
    logEvent('verify.failed', { route: '/api/verify', ip })
    return Response.json({ error: 'VERIFICATION_FAILED' }, { status: 502, headers: headers(request) })
  }
}
