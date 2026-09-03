const cases = [
  {
    name: 'Gautret corroborated retraction',
    doi: '10.1016/j.ijantimicag.2020.105949',
    openAlexRetracted: true,
    crossrefType: 'retraction',
  },
  {
    name: 'Lesne retraction history',
    doi: '10.1038/nature04533',
    openAlexRetracted: true,
    crossrefType: 'expression_of_concern',
  },
  {
    name: 'OpenAlex-only retraction',
    doi: '10.1038/nrg2336',
    openAlexRetracted: true,
    crossrefType: null,
  },
  {
    name: 'Publisher EOC only',
    doi: '10.1177/1475090218792382',
    openAlexRetracted: false,
    crossrefType: 'expression_of_concern',
  },
  {
    name: 'Clean DOI',
    doi: '10.1038/nature14539',
    openAlexRetracted: false,
    crossrefType: null,
  },
];

const timeout = (ms) => AbortSignal.timeout(ms);
const headers = { 'User-Agent': 'FORGE/0.1 (mailto:forge@example.com)' };

for (const test of cases) {
  const encoded = encodeURIComponent(test.doi);
  const [openAlexResponse, crossrefResponse] = await Promise.all([
    fetch(`https://api.openalex.org/works/doi:${encoded}`, { headers, signal: timeout(15_000) }),
    fetch(`https://api.crossref.org/works/${encoded}`, { headers, signal: timeout(15_000) }),
  ]);
  if (!openAlexResponse.ok || !crossrefResponse.ok) {
    throw new Error(`${test.name}: HTTP ${openAlexResponse.status}/${crossrefResponse.status}`);
  }
  const openAlex = await openAlexResponse.json();
  const crossrefEnvelope = await crossrefResponse.json();
  const crossref = crossrefEnvelope.message;
  const events = [...(crossref['updated-by'] ?? []), ...(crossref['update-to'] ?? [])];
  const types = [...new Set(events.map((event) => event.type))];

  const openAlexMatches = openAlex.is_retracted === test.openAlexRetracted;
  const crossrefMatches = test.crossrefType === null
    ? !types.includes('retraction') && !types.includes('expression_of_concern')
    : types.includes(test.crossrefType);

  console.log(JSON.stringify({
    name: test.name,
    doi: test.doi,
    openalex_id: openAlex.id,
    is_retracted: openAlex.is_retracted,
    crossref_integrity_event_types: types,
    openalex_source_url: `https://api.openalex.org/works/doi:${encoded}`,
    crossref_source_url: `https://api.crossref.org/works/${encoded}`,
    passed: openAlexMatches && crossrefMatches,
  }));

  if (!openAlexMatches || !crossrefMatches) process.exitCode = 1;
}
