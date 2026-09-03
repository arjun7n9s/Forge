import Link from 'next/link';

const tools = [
  ['list_source_kinds', 'Declares the two public bibliographic sources.'],
  ['verify_citation', 'Reconciles one DOI through the trust firewall.'],
  ['scan_citations', 'Checks up to 50 DOI strings with bounded concurrency.'],
] as const;

export default function Home() {
  return <main className="pageShell">
    <header><div className="wordmark"><span>F</span>FORGE <small>ENRICHMENT</small></div><div className="livePill"><i /> PUBLIC SOURCE ADAPTER</div></header>
    <section className="hero"><p className="eyebrow">CROSS-ORIGIN TRUST BOUNDARY</p><h1>Bibliographic signals,<br /><em>constrained before use.</em></h1><p>OpenAlex and Crossref enter through strict projections. Provider prose, abstracts, authorships, and unknown fields never cross into the personal workspace.</p><div className="actions"><Link href="/provider">Open provider frame</Link><a href="/api/health">Health JSON</a></div></section>
    <section className="proofGrid"><article><span className="metric">2</span><p>public sources</p></article><article><span className="metric">3</span><p>read-only tools</p></article><article><span className="metric">0</span><p>API credentials</p></article></section>
    <section className="tools"><p className="eyebrow">EXPOSED TOOL SURFACE</p>{tools.map(([name, detail], index) => <article key={name}><span>0{index + 1}</span><div><code>{name}</code><p>{detail}</p></div><b>READ ONLY</b></article>)}</section>
  </main>;
}
