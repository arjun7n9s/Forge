import test from 'node:test'
import assert from 'node:assert/strict'
import { BodyLimitError, VERIFY_BODY_LIMIT, readJsonBody } from '../../src/lib/http/bodyLimit.ts'
import { redact } from '../../src/lib/http/log.ts'
import { createRateLimiter } from '../../src/lib/http/rateLimit.ts'
import { GET as readinessGet } from '../../src/app/api/readiness/route.ts'
import { POST as verifyPost } from '../../src/app/api/verify/route.ts'
import { securityHeaders, REQUIRED_HEADER_NAMES } from '../../security-headers.mjs'

test('rate limiter trips per IP and per DOI', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, ipMax: 2, doiMax: 1 })
  assert.equal(limiter.check('1.1.1.1', '10.1/a').ok, true)
  assert.equal(limiter.check('1.1.1.1', '10.1/a').ok, false)
  assert.equal(limiter.check('1.1.1.1', '10.1/b').ok, true)
  assert.equal(limiter.check('1.1.1.1', '10.1/c').ok, false)
  assert.equal(limiter.check('1.1.1.1', '10.1/c').scope, 'ip')
})

test('body reader rejects oversized verify payloads', async () => {
  const huge = 'x'.repeat(VERIFY_BODY_LIMIT + 8)
  await assert.rejects(readJsonBody(new Request('https://enrich.local/api/verify', { method: 'POST', headers: { 'content-length': String(huge.length) }, body: huge }), VERIFY_BODY_LIMIT), BodyLimitError)
})

test('structured log redacts DOIs and access-key headers', () => {
  const redacted = redact({ doi: '10.1038/nature14539', dois: ['10.1/a'], 'x-access-key': 'secret-token', status: 'ok' })
  assert.equal(JSON.stringify(redacted).includes('10.1038/nature14539'), false)
  assert.equal(JSON.stringify(redacted).includes('secret-token'), false)
  assert.equal(redacted.status, 'ok')
  assert.ok(redacted.doiFingerprint)
})

test('verify route returns 413 for oversized bodies', async () => {
  process.env.FORGE_PERSONAL_ORIGIN = 'https://forge.local'
  const body = JSON.stringify({ doi: '10.1234/x', padding: 'n'.repeat(5000) })
  const response = await verifyPost(new Request('https://enrich.local/api/verify', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://forge.local', 'content-length': String(body.length) }, body }))
  assert.equal(response.status, 413)
})

test('readiness does not claim OpenAlex or Crossref health', async () => {
  const response = await readinessGet()
  const body = await response.json() as { status: string; upstream: string }
  assert.equal(response.status, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.upstream, 'not_probed')
  assert.equal(JSON.stringify(body).includes('openalex'), false)
})

test('enrich security headers include CSP, HSTS, and frame-ancestors', () => {
  const headers = securityHeaders({ frameAncestors: 'https://personal.example' })
  const names = headers.map((header) => header.key.toLowerCase())
  for (const name of REQUIRED_HEADER_NAMES) assert.ok(names.includes(name), name)
  const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? ''
  assert.ok(csp.includes('frame-ancestors https://personal.example'))
  assert.ok(csp.includes("Permissions-Policy") === false)
  assert.equal(headers.find((header) => header.key === 'Permissions-Policy')?.value, 'tools=(self)')
  assert.equal(headers.find((header) => header.key === 'Referrer-Policy')?.value, 'no-referrer')
  assert.ok((headers.find((header) => header.key === 'Strict-Transport-Security')?.value ?? '').includes('max-age=31536000'))
})
