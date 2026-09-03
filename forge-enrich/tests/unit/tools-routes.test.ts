import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProviderTools, registerProviderTools } from '../../src/lib/webmcp/providerKit.ts'
import { corsHeaders, isAllowedOrigin } from '../../src/lib/http/cors.ts'
import { OPTIONS as verifyOptions, POST as verifyPost } from '../../src/app/api/verify/route.ts'
import { OPTIONS as scanOptions, POST as scanPost } from '../../src/app/api/scan/route.ts'
import { GET as healthGet } from '../../src/app/api/health/route.ts'

const service={ verify:async(doi:string)=>({doi,status:'ok',card_type:null,colors:{integrity:'green'},sources:{},timings_ms:{total:1,openalex:1,crossref:1},cache:{state:'miss'}}), scan:async(dois:string[])=>Promise.all(dois.map(doi=>service.verify(doi))) }

test('provider defines exactly three read-only idempotent tools with closed schemas', () => {
  const tools=buildProviderTools(service as never)
  assert.deepEqual(tools.map(t=>t.name),['list_source_kinds','verify_citation','scan_citations'])
  for(const tool of tools){ assert.deepEqual(tool.annotations,{readOnlyHint:true,idempotentHint:true,untrustedContentHint:false}); assert.equal(tool.inputSchema.additionalProperties,false) }
  const schema = tools[2]?.inputSchema as { properties: { dois: { maxItems: number } } }
  assert.equal(schema.properties.dois.maxItems,50)
})

test('registration refuses wildcard and passes exact exposedTo origin', async () => {
  await assert.rejects(()=>registerProviderTools({registerTool:async()=>{}},service as never,'*'),/EXPOSED_TO_WILDCARD/)
  const calls:unknown[]=[]; await registerProviderTools({registerTool:async(...args:unknown[])=>{calls.push(args)}},service as never,'https://forge.local')
  assert.equal(calls.length,3); assert.deepEqual((calls[0] as unknown[])[1],{exposedTo:['https://forge.local']})
})

test('tool runtime validation rejects malformed DOI and scan over 50', async () => {
  const tools=buildProviderTools(service as never)
  await assert.rejects(()=>tools[1]!.execute({doi:'not-a-doi'}),/INVALID_DOI/)
  await assert.rejects(()=>tools[2]!.execute({dois:Array(51).fill('10.1234/x')}),/SCAN_LIMIT/)
})

test('CORS allows only configured personal origin', () => {
  assert.equal(isAllowedOrigin('https://forge.local','https://forge.local'),true)
  assert.equal(isAllowedOrigin('https://attacker.example','https://forge.local'),false)
  assert.equal(corsHeaders('https://forge.local','https://forge.local')['Access-Control-Allow-Origin'],'https://forge.local')
  assert.equal(corsHeaders('https://attacker.example','https://forge.local')['Access-Control-Allow-Origin'],undefined)
})

test('route preflights expose CORS only to the configured exact origin', async () => {
  process.env.FORGE_PERSONAL_ORIGIN='https://forge.local'
  const allowed=await verifyOptions(new Request('https://enrich.local/api/verify',{method:'OPTIONS',headers:{Origin:'https://forge.local'}}))
  const denied=await scanOptions(new Request('https://enrich.local/api/scan',{method:'OPTIONS',headers:{Origin:'https://attacker.example'}}))
  assert.equal(allowed.status,204)
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://forge.local')
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null)
})

test('routes reject malformed verify input and scans over 50 without upstream work', async () => {
  process.env.FORGE_PERSONAL_ORIGIN='https://forge.local'
  const headers={'content-type':'application/json',origin:'https://forge.local'}
  const invalid=await verifyPost(new Request('https://enrich.local/api/verify',{method:'POST',headers,body:JSON.stringify({doi:'bad'})}))
  const oversized=await scanPost(new Request('https://enrich.local/api/scan',{method:'POST',headers,body:JSON.stringify({dois:Array(51).fill('10.1234/x')})}))
  assert.equal(invalid.status,400)
  assert.equal(oversized.status,400)
  assert.deepEqual(await invalid.json(),{error:'INVALID_DOI'})
  assert.deepEqual(await oversized.json(),{error:'SCAN_LIMIT'})
})

test('health route reports service identity without claiming live upstream status', async () => {
  const response=await healthGet()
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{service:'forge-enrich',status:'ok'})
})
