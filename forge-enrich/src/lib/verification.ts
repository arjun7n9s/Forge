import {normalizeDoi} from './doi.ts';import {classify} from './classify.ts';import {VerificationCache,globalVerificationCache} from './cache.ts';import {fetchOpenAlex} from './sources/openalex.ts';import {fetchCrossref} from './sources/crossref.ts';import type {SourceResult} from './sources/types.ts';import type {VerificationResult} from './verification-types.ts'
type OA=(doi:string)=>Promise<SourceResult<'openalex'>>;type CR=(doi:string)=>Promise<SourceResult<'crossref'>>
export function createVerificationService(deps:{openAlex?:OA;crossref?:CR;cache?:VerificationCache;concurrency?:number}={}){
 const openAlex=deps.openAlex??fetchOpenAlex,crossref=deps.crossref??fetchCrossref,cache=deps.cache??globalVerificationCache
 const verify=async(input:string):Promise<VerificationResult>=>{
  const doi=normalizeDoi(input),cached=cache.get(doi);if(cached)return {...cached,cache:{state:'hit'}}
  const active=cache.getFlight(doi);if(active)return {...await active,cache:{state:'shared'}}
  const work=(async()=>{const started=performance.now();let oaMs=0,crMs=0
   const timed=async<T>(fn:()=>Promise<T>,done:(n:number)=>void)=>{const at=performance.now();try{return await fn()}finally{done(Math.round((performance.now()-at)*100)/100)}}
   const settled=await Promise.allSettled([timed(()=>openAlex(doi),n=>oaMs=n),timed(()=>crossref(doi),n=>crMs=n)])
   const openalex:SourceResult<'openalex'>=settled[0].status==='fulfilled'?settled[0].value:{outcome:'upstream_error',source_url:`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`}
   const cross:SourceResult<'crossref'>=settled[1].status==='fulfilled'?settled[1].value:{outcome:'upstream_error',source_url:`https://api.crossref.org/works/${encodeURIComponent(doi)}`}
   const classified=classify(openalex,cross);const color=classified.status==='retracted'?'red':classified.status==='eoc'?'amber':classified.status==='ok'?'green':'gray'
   const value:VerificationResult={doi,...classified,colors:{integrity:color},sources:{openalex,crossref:cross},timings_ms:{total:Math.round((performance.now()-started)*100)/100,openalex:oaMs,crossref:crMs},cache:{state:'miss'}}
   cache.set(doi,value);return value})()
  cache.setFlight(doi,work);return work
 }
 const scan=async(inputs:string[])=>{if(inputs.length>50)throw new Error('SCAN_LIMIT');const out=new Array<VerificationResult>(inputs.length);let cursor=0
  const workers=Array.from({length:Math.min(deps.concurrency??6,inputs.length)},async()=>{for(;;){const i=cursor++;if(i>=inputs.length)return;out[i]=await verify(inputs[i]!)}});await Promise.all(workers);return out}
 return {verify,scan}
}
export const verificationService=createVerificationService()
