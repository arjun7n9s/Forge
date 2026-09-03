import { classify } from '../forge-enrich/src/lib/classify.ts';
import { fetchCrossref } from '../forge-enrich/src/lib/sources/crossref.ts';
import { fetchOpenAlex } from '../forge-enrich/src/lib/sources/openalex.ts';

const cases = [
  {
    name: 'EOC-only',
    doi: '10.1177/1475090218792382',
    expect: { status: 'eoc', card: 'eoc_only', crMustInclude: 'expression_of_concern', crMustExclude: 'retraction' },
  },
  {
    name: 'OpenAlex-only retraction',
    doi: '10.1038/nrg2336',
    expect: { status: 'retracted', card: 'openalex_only', crMustExclude: 'retraction' },
  },
  {
    name: 'Erratum-only no retraction',
    doi: '10.1038/nrg2336',
    expect: { crossrefEventsExclude: ['retraction', 'expression_of_concern'] },
  },
  {
    name: 'Lesne EOC-then-retraction',
    doi: '10.1038/nature04533',
    expect: { status: 'retracted', card: 'corroborated', crMustInclude: ['expression_of_concern', 'retraction'] },
  },
  {
    name: 'Clean DOI',
    doi: '10.1038/nature14539',
    expect: { status: 'ok', card: null, crMustExclude: 'retraction' },
  },
];

for (const test of cases) {
  const [openalex, crossref] = await Promise.all([
    fetchOpenAlex(test.doi, { timeoutMs: 15_000 }),
    fetchCrossref(test.doi, { timeoutMs: 15_000 }),
  ]);
  const projection = classify(openalex, crossref);
  const events = crossref.outcome === 'ok' ? crossref.data.integrity_events.map((event) => event.type) : [];
  const record = {
    name: test.name,
    doi: test.doi,
    openalex_outcome: openalex.outcome,
    crossref_outcome: crossref.outcome,
    crossref_integrity_event_types: events,
    classified_status: projection.status,
    classified_card: projection.card_type,
  };

  let passed = openalex.outcome === 'ok' && crossref.outcome === 'ok';
  if (test.expect.status) passed = passed && projection.status === test.expect.status;
  if ('card' in test.expect) passed = passed && projection.card_type === test.expect.card;
  const mustInclude = test.expect.crMustInclude;
  if (typeof mustInclude === 'string') passed = passed && events.includes(mustInclude);
  if (Array.isArray(mustInclude)) passed = passed && mustInclude.every((type) => events.includes(type));
  const mustExclude = test.expect.crMustExclude;
  if (typeof mustExclude === 'string') passed = passed && !events.includes(mustExclude);
  if (test.expect.crossrefEventsExclude) {
    passed = passed && test.expect.crossrefEventsExclude.every((type) => !events.includes(type));
  }

  console.log(JSON.stringify({ ...record, passed }));
  if (!passed) process.exitCode = 1;
}
