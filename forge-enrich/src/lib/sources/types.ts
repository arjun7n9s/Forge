export type Outcome='ok'|'not_found'|'timeout'|'upstream_error'|'malformed'
export interface OpenAlexProjection { id:string; doi:string; title:string; is_retracted:boolean; publication_date:string }
export interface IntegrityEvent { relation:'update-to'|'updated-by'; type:string; notice_doi:string; source_kind:'publisher'|'retraction-watch'|'other'; updated_date:string }
export interface CrossrefProjection { doi:string; title:string; integrity_events:IntegrityEvent[] }
export type SourceData={openalex:OpenAlexProjection;crossref:CrossrefProjection}
export type SourceResult<K extends keyof SourceData> =
  | {outcome:'ok';data:SourceData[K];source_url:string}
  | {outcome:Exclude<Outcome,'ok'>;source_url:string}
export interface AdapterOptions { fetcher?:typeof fetch; timeoutMs?:number; mailto?:string }
