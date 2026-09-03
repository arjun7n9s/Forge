import type {VerificationResult} from './verification-types.ts'
interface Entry{value:VerificationResult;expiresAt:number}
export class VerificationCache{
 private entries=new Map<string,Entry>(); private flights=new Map<string,Promise<VerificationResult>>(); private readonly now:()=>number; private readonly maxEntries:number
 constructor(now:()=>number=Date.now, maxEntries=5_000){this.now=now; this.maxEntries=maxEntries}
 private sweep(now:number){
  for(const [doi,entry] of this.entries){ if(entry.expiresAt<=now) this.entries.delete(doi) }
  while(this.entries.size>=this.maxEntries){
   const oldest=this.entries.keys().next().value
   if(oldest===undefined) break
   this.entries.delete(oldest)
  }
 }
 get(doi:string){const now=this.now(); this.sweep(now); const entry=this.entries.get(doi);return entry&&entry.expiresAt>now?entry.value:undefined}
 set(doi:string,value:VerificationResult){const now=this.now(); this.sweep(now); const ttl=value.status==='ok'?86_400_000:3_600_000;this.entries.set(doi,{value,expiresAt:now+ttl})}
 getFlight(doi:string){return this.flights.get(doi)}
 setFlight(doi:string,value:Promise<VerificationResult>){this.flights.set(doi,value);void value.finally(()=>this.flights.delete(doi))}
 get size(){return this.entries.size}
}
const state=globalThis as typeof globalThis & {__forgeVerificationCache?:VerificationCache}
export const globalVerificationCache=state.__forgeVerificationCache??=new VerificationCache()
