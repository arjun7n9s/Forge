'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { resolveModelContext } from '@forge/core';
import { useForge } from './ForgeProvider';
import { WebMcpBanner } from './WebMcpBanner';
import { PERSONAL_TOOL_NAMES, type EditorState } from '@/lib/webmcp/registerTools';

type DiscoveryState = 'unsupported' | 'probing' | 'supported';
type NegativeState = 'idle' | 'probing' | 'pass' | 'fail' | 'timeout' | 'unsupported';

function editorStateFrom(review: unknown, pending: boolean): EditorState {
  if (review) return 'EDITOR_REVIEW_OPEN';
  if (pending) return 'EDITOR_DRAFT_READY';
  return 'EDITOR_IDLE';
}

export function ProofPanel() {
  const { transportLabel, transportKind, enrichOrigin, snapshot, review } = useForge();
  const pending = snapshot?.drafts.some((draft) => draft.status === 'pending') ?? false;
  const state = editorStateFrom(review, pending);
  const [discovery, setDiscovery] = useState<DiscoveryState>('probing');
  const [tools, setTools] = useState<string[]>([]);
  const [negative, setNegative] = useState<NegativeState>('idle');

  useEffect(() => {
    let active = true;
    const context = resolveModelContext();
    if (!context?.getTools) {
      queueMicrotask(() => {
        if (!active) return;
        setDiscovery('unsupported');
        setTools([]);
      });
      return () => { active = false; };
    }
    const read = async () => {
      try {
        const registered = await context.getTools();
        if (!active) return;
        setTools(registered.map((tool) => tool.name));
        setDiscovery('supported');
      } catch {
        if (active) {
          setDiscovery('unsupported');
          setTools([]);
        }
      }
    };
    void read();
    const onChange = () => { void read(); };
    context.addEventListener('toolchange', onChange);
    const previous = context.ontoolchange;
    context.ontoolchange = onChange;
    return () => {
      active = false;
      context.removeEventListener('toolchange', onChange);
      context.ontoolchange = previous;
    };
  }, [state]);

  const runNegative = useCallback(async () => {
    const context = resolveModelContext();
    if (!context?.getTools) {
      setNegative('unsupported');
      return;
    }
    setNegative('probing');
    const timeout = new Promise<Extract<NegativeState, 'timeout'>>((resolve) => {
      window.setTimeout(() => resolve('timeout'), 2_000);
    });
    const probe = context.getTools({ fromOrigins: ['https://attacker.example'] })
      .then((list): NegativeState => (list.length === 0 ? 'pass' : 'fail'))
      .catch((): NegativeState => 'fail');
    setNegative(await Promise.race([probe, timeout]));
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void runNegative(); });
  }, [runNegative]);

  const catalog = [...new Set([...PERSONAL_TOOL_NAMES, ...tools])];
  const negativeLabel = {
    idle: 'not run',
    probing: 'probing…',
    pass: '0 tools discovered',
    fail: 'unexpected exposure',
    timeout: 'probe timed out',
    unsupported: 'no modelContext',
  }[negative];
  const discoveryLabel = { unsupported: 'Unsupported', probing: 'Probing…', supported: 'Supported' }[discovery];

  return <main className="proofPage">
    <header><Link href="/" className="brand"><span>F</span><strong>FORGE</strong></Link><Link href="/" className="quietButton">Back to workspace</Link></header>
    <WebMcpBanner />
    <section className="proofHero"><span className="eyebrow">LIVE CONFORMANCE SURFACE</span><h1>Trust is visible,<br /><em>not narrated.</em></h1><p>This page reads the running browser capability and product state. No diagram substitutes for the registered tools below.</p></section>
    <section className="proofCards">
      <article><span>TRANSPORT</span><strong className={transportKind}>{transportLabel}</strong><code>{transportKind}</code></article>
      <article><span>ENRICHMENT ORIGIN</span><strong>{enrichOrigin}</strong><code>exact origin only</code></article>
      <article>
        <span>EDITOR STATE</span>
        <strong data-testid="editor-state">{state}</strong>
        <code>{tools.length} personal tools from getTools()</code>
      </article>
      <article>
        <span>DISCOVERY</span>
        <strong data-testid="discovery-state" data-discovery={discovery}>{discoveryLabel}</strong>
        <code>{discovery === 'supported' ? 'document then navigator' : discovery === 'probing' ? 'calling getTools()' : 'modelContext unavailable'}</code>
      </article>
      <article>
        <span>NEGATIVE ORIGIN</span>
        <strong data-testid="negative-origin" data-negative={negative} className={negative === 'pass' ? 'pass' : negative === 'fail' || negative === 'timeout' ? 'fail' : ''}>{negativeLabel}</strong>
        <button onClick={() => void runNegative()}>Re-run probe</button>
      </article>
    </section>
    <section className="toolManifest">
      <div className="panelHeader"><div><span className="eyebrow">STATE-AWARE REGISTRATION</span><h2>Current personal tool manifest</h2></div><span>{state}</span></div>
      {catalog.map((name, index) => {
        const active = tools.includes(name);
        const reviewOnly = name === 'confirm_edit' || name === 'reject_edit';
        return <article key={name} data-testid="proof-tool" data-tool-name={name} data-active={active ? 'true' : 'false'} className={active ? 'active' : 'inactive'}>
          <span>0{index + 1}</span>
          <code>{name}</code>
          <p>{reviewOnly ? 'Exists only while the review drawer is open.' : name === 'propose_note_edit' ? 'Appears when a pending draft exists or review is open.' : 'Available in the base private workspace.'}</p>
          <b>{active ? 'REGISTERED' : reviewOnly ? 'REVIEW-GATED' : 'STATE-GATED'}</b>
        </article>;
      })}
    </section>
    <section className="firewallProof"><div><span className="eyebrow">TRUST FIREWALL</span><h2>Parse → validate → project → classify</h2><p>Provider prose and unknown fields are discarded. Rejections expose only a rule code and JSON pointer.</p></div><div className="pipeline"><span>RAW PROVIDER</span><i>→</i><span>AJV 2020</span><i>→</i><span>ALLOWLIST</span><i>→</i><span>INTEGRITY SIGNAL</span></div></section>
  </main>;
}
