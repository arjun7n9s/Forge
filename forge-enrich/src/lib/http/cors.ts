export function isAllowedOrigin(origin:string|null,allowed:string){return origin===allowed}
export function corsHeaders(origin:string|null,allowed:string):Record<string,string>{
 const headers:Record<string,string>={'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}
 if(isAllowedOrigin(origin,allowed))headers['Access-Control-Allow-Origin']=allowed
 return headers
}
export const personalOrigin=()=>process.env.FORGE_PERSONAL_ORIGIN??process.env.NEXT_PUBLIC_FORGE_ORIGIN??'http://localhost:3000'
