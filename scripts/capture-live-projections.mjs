import { mkdir, writeFile } from 'node:fs/promises';

const dois = [
  '10.1016/j.ijantimicag.2020.105949',
  '10.1038/nature04533',
  '10.1038/nrg2336',
  '10.1177/1475090218792382',
  '10.1038/nature14539',
];
const headers = { 'User-Agent': 'FORGE/0.1 (mailto:forge@example.com)' };
const capturedAt = new Date().toISOString();
const records = [];

for (const doi of dois) {
  const encoded = encodeURIComponent(doi);
  const openalexUrl = `https://api.openalex.org/works/doi:${encoded}`;
  const crossrefUrl = `https://api.crossref.org/works/${encoded}`;
  const [oaResponse, crResponse] = await Promise.all([
    fetch(openalexUrl, { headers, signal: AbortSignal.timeout(15_000) }),
    fetch(crossrefUrl, { headers, signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!oaResponse.ok || !crResponse.ok) {
    throw new Error(`${doi}: source HTTP ${oaResponse.status}/${crResponse.status}`);
  }
  const oa = await oaResponse.json();
  const cr = (await crResponse.json()).message;
  const projectEvent = (event, relation) => ({
    relation,
    type: String(event.type),
    source: String(event.source),
    updated_date: String(event.updated?.['date-time'] ?? ''),
  });
  const integrityEvents = [
    ...(cr['updated-by'] ?? []).map((event) => projectEvent(event, 'updated-by')),
    ...(cr['update-to'] ?? []).map((event) => projectEvent(event, 'update-to')),
  ];
  records.push({
    doi,
    captured_at: capturedAt,
    openalex: {
      source_url: openalexUrl,
      id: String(oa.id),
      doi: String(oa.doi),
      title: String(oa.title),
      is_retracted: Boolean(oa.is_retracted),
      publication_date: String(oa.publication_date),
    },
    crossref: {
      source_url: crossrefUrl,
      doi: String(cr.DOI),
      title: String(cr.title?.[0] ?? ''),
      integrity_events: integrityEvents,
    },
  });
}

await mkdir(new URL('../docs/generated/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../docs/generated/live-source-projections.json', import.meta.url),
  `${JSON.stringify({ captured_at: capturedAt, records }, null, 2)}\n`,
  'utf8',
);
console.log(`Captured ${records.length} projected source records at ${capturedAt}`);
