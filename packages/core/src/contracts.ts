export interface OpenAlexProjected {
  id: string;
  doi: string | null;
  title: string;
  isRetracted: boolean;
  publicationDate: string;
}

export type IntegrityEventType = 'retraction' | 'expression_of_concern';

export interface CrossrefIntegrityEvent {
  type: IntegrityEventType;
  relation: 'update-to' | 'updated-by';
  noticeDoi: string;
  sourceKind: 'publisher' | 'retraction-watch' | 'other';
  updatedDate: string;
}

export interface CrossrefProjected {
  doi: string;
  title: string;
  /** Normalized union of Crossref `update-to` and `updated-by`. */
  integrityEvents: CrossrefIntegrityEvent[];
}

export interface SourceValues {
  openalex: OpenAlexProjected;
  crossref: CrossrefProjected;
}

export type SourceName = keyof SourceValues;
export type SourceOutcome<S extends SourceName> =
  | { state: 'ok'; source: S; value: SourceValues[S] }
  | { state: 'timeout'; source: S }
  | { state: 'error'; source: S; code: string };
