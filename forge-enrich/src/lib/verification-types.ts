import type {CardType,IntegrityStatus} from './classify.ts'
import type {SourceResult} from './sources/types.ts'
export interface VerificationResult{
 doi:string;status:IntegrityStatus;card_type:CardType;colors:{integrity:'red'|'amber'|'green'|'gray'};
 sources:{openalex:SourceResult<'openalex'>;crossref:SourceResult<'crossref'>};
 timings_ms:{total:number;openalex:number;crossref:number};cache:{state:'hit'|'miss'|'shared'}
}
