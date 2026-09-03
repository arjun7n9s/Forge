import test from 'node:test'
import assert from 'node:assert/strict'
import { VerificationCache } from '../../src/lib/cache.ts'
import { createVerificationService } from '../../src/lib/verification.ts'
import type { SourceResult } from '../../src/lib/sources/types.ts'

const oa = (retracted=false): SourceResult<'openalex'> => ({outcome:'ok',source_url:'https://api.openalex.org/fixture',data:{id:'https://openalex.org/W1',doi:'10.1/x',title:'Fixture',is_retracted:retracted,publication_date:'2020-01-01'}})
const cr = (type?:string): SourceResult<'crossref'> => ({outcome:'ok',source_url:'https://api.crossref.org/fixture',data:{doi:'10.1/x',title:'Fixture',integrity_events:type?[{relation:'updated-by',type,notice_doi:'10.1/notice',source_kind:'publisher',updated_date:'2020-01-01'}]:[]}})

test('cache applies 24h clean and 1h integrity/unknown TTL', () => {
  let now=0; const cache=new VerificationCache(()=>now)
  cache.set('10.1/clean',{status:'ok'} as never); cache.set('10.1/bad',{status:'retracted'} as never); cache.set('10.1/u',{status:'unknown'} as never)
  now=3_600_000
  assert.ok(cache.get('10.1/clean')); assert.equal(cache.get('10.1/bad'),undefined); assert.equal(cache.get('10.1/u'),undefined)
  now=86_400_000
  assert.equal(cache.get('10.1/clean'),undefined)
})

test('service single-flights concurrent DOI checks and reports cache hit', async () => {
  let calls=0; const wait=async()=>{calls++; await new Promise(r=>setTimeout(r,10)); return oa(false)}
  const service=createVerificationService({openAlex:wait,crossref:async()=>cr(),cache:new VerificationCache()})
  const [a,b]=await Promise.all([service.verify('10.1234/X'),service.verify('https://doi.org/10.1234/x')])
  assert.equal(calls,1); assert.equal(a.status,'ok'); assert.equal(b.doi,'10.1234/x')
  const c=await service.verify('10.1234/x'); assert.equal(c.cache.state,'hit')
})

test('service classifier handles corroboration, disagreement, and timeout lock', async () => {
  const run=async(a:SourceResult<'openalex'>,c:SourceResult<'crossref'>)=>createVerificationService({openAlex:async()=>a,crossref:async()=>c,cache:new VerificationCache()}).verify('10.1234/x')
  assert.deepEqual((await run(oa(true),cr('retraction'))).card_type,'corroborated')
  const disagree=await run(oa(true),cr('expression-of-concern')); assert.equal(disagree.status,'eoc'); assert.equal(disagree.card_type,'disagree'); assert.equal(disagree.colors.integrity,'amber')
  const unknown=await run({outcome:'timeout',source_url:'https://api.openalex.org/fixture'},cr('retraction')); assert.equal(unknown.status,'unknown'); assert.equal(unknown.colors.integrity,'gray')
})

test('service classifies a Crossref-only expression of concern as amber eoc-only', async () => {
  const service=createVerificationService({openAlex:async()=>oa(false),crossref:async()=>cr('expression_of_concern'),cache:new VerificationCache()})
  const result=await service.verify('10.1234/eoc')
  assert.equal(result.status,'eoc')
  assert.equal(result.card_type,'eoc_only')
  assert.equal(result.colors.integrity,'amber')
})
