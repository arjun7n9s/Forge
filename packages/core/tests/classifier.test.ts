import { describe, expect, it } from 'vitest';
import { classifyIntegrity, type SourceOutcome } from '../src/classifier.js';

const oa = (isRetracted: boolean): SourceOutcome<'openalex'> => ({ state: 'ok', source: 'openalex', value: { id: 'W1', doi: '10.1/x', title: 'T', isRetracted, publicationDate: '2020-01-01' } });
const cr = (types: Array<'retraction' | 'expression_of_concern'>): SourceOutcome<'crossref'> => ({ state: 'ok', source: 'crossref', value: { doi: '10.1/x', title: 'T', integrityEvents: types.map((type) => ({ type, relation: 'updated-by', noticeDoi: '10.1/y', sourceKind: 'publisher', updatedDate: '2020-01-02' })) } });
const silent = cr([]);

describe('classifyIntegrity', () => {
  it.each([
    [oa(true), cr(['retraction']), ['red', 'retracted', 'corroborated']],
    [oa(true), silent, ['red', 'retracted', 'openalex_only']],
    [oa(true), cr(['expression_of_concern']), ['amber', 'eoc', 'disagree']],
    [oa(false), cr(['expression_of_concern']), ['amber', 'eoc', 'eoc_only']],
    [oa(false), cr(['retraction']), ['red', 'retracted', 'crossref_only']],
    [oa(false), silent, ['green', 'ok', undefined]],
  ] as const)('classifies every signal branch', (openalex, crossref, expected) => {
    const result = classifyIntegrity(openalex, crossref);
    expect([result.color, result.status, result.cardType]).toEqual(expected);
    expect(result.sources).toEqual({ openalex, crossref });
  });

  it.each(['timeout', 'error'] as const)('returns gray for a %s from either source', (state) => {
    const bad: SourceOutcome<'crossref'> = state === 'timeout' ? { state, source: 'crossref' } : { state, source: 'crossref', code: 'UPSTREAM' };
    const result = classifyIntegrity(oa(false), bad);
    expect(result).toMatchObject({ color: 'gray', status: 'unknown', sources: { openalex: oa(false), crossref: bad } });
  });

  it('preserves explicit conflicts', () => {
    expect(classifyIntegrity(oa(true), cr(['expression_of_concern'])).conflicts).toEqual(['OPENALEX_RETRACTED_CROSSREF_EOC']);
  });

  it('chooses retraction over EOC while preserving all provenance events', () => {
    const crossref = cr(['expression_of_concern', 'retraction']);
    const result = classifyIntegrity(oa(true), crossref);
    expect(result).toMatchObject({ color: 'red', status: 'retracted', cardType: 'corroborated' });
    expect(result.sources.crossref).toEqual(crossref);
  });
});
