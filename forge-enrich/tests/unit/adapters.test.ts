import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchOpenAlex } from '../../src/lib/sources/openalex.ts'
import { fetchCrossref } from '../../src/lib/sources/crossref.ts'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('OpenAlex uses encoded canonical DOI and projects only allowed fields', async () => {
  let seen = ''
  const fetcher: typeof fetch = async (input) => { seen = String(input); return response({ id:'https://openalex.org/W1', doi:'https://doi.org/10.1234/ABC', title:'Fixture title', is_retracted:false, publication_date:'2020-01-02', abstract_inverted_index:{secret:[1]}, authorships:[{raw:'secret'}] }) }
  const result = await fetchOpenAlex('https://doi.org/10.1234/ABC', { fetcher, mailto:'proof@example.org' })
  assert.equal(seen, 'https://api.openalex.org/works/doi:10.1234%2Fabc?mailto=proof%40example.org')
  assert.deepEqual(result, { outcome:'ok', data:{ id:'https://openalex.org/W1', doi:'10.1234/abc', title:'Fixture title', is_retracted:false, publication_date:'2020-01-02' }, source_url:'https://api.openalex.org/works/doi:10.1234%2Fabc?mailto=proof%40example.org' })
  assert.equal(JSON.stringify(result).includes('abstract'), false)
})

test('Crossref sends FORGE mailto user agent and projects update-to', async () => {
  let seen = ''; let agent = ''
  const fetcher: typeof fetch = async (input, init) => { seen=String(input); agent=String((init?.headers as Record<string,string>)['User-Agent']); return response({ status:'ok', message:{ DOI:'10.5555/X', title:['Fixture title'], 'update-to':[{type:'retraction', DOI:'10.5555/notice', source:'Fixture registry', updated:{'date-time':'2021-03-04T00:00:00Z'}, label:'must redact'},{type:'erratum', DOI:'10.5555/erratum', source:'publisher', updated:{'date-time':'2021-04-04T00:00:00Z'}}], abstract:'secret', author:[{name:'secret'}] } }) }
  const result = await fetchCrossref('doi:10.5555/X', { fetcher, mailto:'proof@example.org' })
  assert.equal(seen, 'https://api.crossref.org/works/10.5555%2Fx')
  assert.equal(agent, 'FORGE/0.1 (mailto:proof@example.org)')
  assert.deepEqual(result, { outcome:'ok', data:{ doi:'10.5555/x', title:'Fixture title', integrity_events:[{relation:'update-to',type:'retraction', notice_doi:'10.5555/notice', source_kind:'other', updated_date:'2021-03-04T00:00:00Z'}] }, source_url:seen })
  assert.equal(JSON.stringify(result).includes('abstract'), false)
})

test('Crossref normalizes updated-by expression of concern records', async () => {
  const result = await fetchCrossref('10.1177/1475090218792382', { fetcher: async()=>response({message:{DOI:'10.1177/1475090218792382',title:['Fixture'], 'updated-by':[{type:'expression_of_concern',source:'publisher',updated:{'date-time':'2025-08-07T00:00:00Z'},DOI:'10.1177/notice'}]}}) })
  assert.equal(result.outcome,'ok')
  assert.deepEqual(result.outcome==='ok' ? result.data.integrity_events : [], [{relation:'updated-by',type:'expression_of_concern',notice_doi:'10.1177/notice',source_kind:'publisher',updated_date:'2025-08-07T00:00:00Z'}])
})

test('Crossref preserves every event in update-to and updated-by history', async () => {
  const result = await fetchCrossref('10.1177/history', { fetcher: async()=>response({message:{DOI:'10.1177/history',title:['Fixture'],
    'update-to':[{type:'retraction',DOI:'10.1177/retraction',updated:{'date-time':'2024-01-02T00:00:00Z'}}],
    'updated-by':[{type:'expression_of_concern',DOI:'10.1177/concern',updated:{'date-time':'2023-01-02T00:00:00Z'}}]
  }}) })
  assert.equal(result.outcome,'ok')
  assert.deepEqual(result.outcome==='ok' ? result.data.integrity_events : [], [
    {relation:'update-to',type:'retraction',notice_doi:'10.1177/retraction',source_kind:'other',updated_date:'2024-01-02T00:00:00Z'},
    {relation:'updated-by',type:'expression_of_concern',notice_doi:'10.1177/concern',source_kind:'other',updated_date:'2023-01-02T00:00:00Z'}
  ])
})

test('adapters distinguish not_found, malformed, upstream_error, and timeout without raw body leakage', async () => {
  const nf = await fetchOpenAlex('10.1234/a', { fetcher: async()=>response({},404) })
  const malformed = await fetchCrossref('10.1234/a', { fetcher: async()=>response({ message:{ DOI:4, abstract:'LEAK' }}) })
  const upstream = await fetchCrossref('10.1234/a', { fetcher: async()=>response({ body:'LEAK' },503) })
  const timeout = await fetchOpenAlex('10.1234/a', { timeoutMs:5, fetcher: async (_u, init) => await new Promise<Response>((_r, reject) => { init?.signal?.addEventListener('abort',()=>reject(new DOMException('LEAK','AbortError'))) }) })
  assert.equal(nf.outcome,'not_found'); assert.equal(malformed.outcome,'malformed'); assert.equal(upstream.outcome,'upstream_error'); assert.equal(timeout.outcome,'timeout')
  assert.equal(JSON.stringify([malformed,upstream,timeout]).includes('LEAK'), false)
})
