'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForge } from './ForgeProvider';
import { NoteEditor } from './NoteEditor';
import { DraftCard } from './DraftCard';
import { ReviewDrawer } from './ReviewDrawer';
import { PersistenceGate } from './PersistenceGate';
import { WebMcpBanner } from './WebMcpBanner';

function shortHash(value: string) { return `${value.slice(0, 7)}…${value.slice(-5)}`; }

export function Workspace({ selectedId }: { selectedId?: string }) {
  const { snapshot, transportLabel, transportKind, enrichOrigin, persistenceMode, persistenceReason, persistenceRevision, login, logout, verify, saveNote, runScan, openReview } = useForge();
  const [scanning, setScanning] = useState<string>();
  if (persistenceMode === 'locked') return <PersistenceGate mode={persistenceMode} login={login} />;
  if (!snapshot) return <div className="loadingScreen"><span className="brandBlock">F</span><p>Opening private workspace…</p></div>;
  const selected = selectedId ? snapshot.notes.find((note) => note.id === selectedId) : undefined;
  const pending = snapshot.drafts.filter((draft) => draft.status === 'pending');
  const checked = snapshot.auditEvents.filter((event) => event.eventType === 'check.performed').length;
  const scan = async (id: string) => { setScanning(id); try { await runScan(id); } finally { setScanning(undefined); } };

  return <div className="appShell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span>F</span><strong>FORGE</strong></Link>
      <nav className="primaryNav"><Link href="/" className={!selectedId ? 'active' : ''}>Workspace</Link><Link href="/proof">Proof surface</Link></nav>
      <div className="sidebarSection"><div className="sectionLabel"><span>NOTES</span><b>{snapshot.notes.length}</b></div>
        <div className="noteLinks">{snapshot.notes.map((note) => <Link key={note.id} href={`/notes/${note.id}`} className={selectedId === note.id ? 'active' : ''}><i /> <span>{note.title}</span>{snapshot.drafts.some((draft) => draft.noteId === note.id && draft.status === 'pending') && <b className="miniPending">1</b>}</Link>)}</div>
      </div>
      <div className="transportCard"><div><i className={transportKind} /><span>{transportLabel}</span></div><code>{enrichOrigin.replace(/^https?:\/\//, '')}</code></div>
      <p className="sidebarFoot">PRIVATE NOTES · PUBLIC SIGNALS</p>
    </aside>

    <main className="workspace">
      <WebMcpBanner />
      <PersistenceGate mode={persistenceMode} reason={persistenceReason} revision={persistenceRevision} login={login} logout={logout} />
      <header className="topbar"><div><span className="eyebrow">CITATION INTEGRITY WORKSPACE</span><h1>{selected ? selected.title : 'Evidence under review'}</h1></div><div className="topActions"><Link href="/proof" className="quietButton">Inspect proof</Link>{selected && <button className="scanButton" disabled={scanning === selected.id} onClick={() => void scan(selected.id)}>{scanning === selected.id ? 'Checking sources…' : 'Run scan now'}</button>}</div></header>

      {selected ? <div className="noteWorkspace">
        <div className="noteMeta"><span>NOTE ID <code>{selected.id}</code></span><span>CHAIN HEAD <code>{shortHash(selected.contentHash)}</code></span><span>UPDATED <b>{new Date(selected.updatedAt).toLocaleDateString()}</b></span></div>
        <NoteEditor key={selected.id} initialBody={selected.body} verify={verify} onSave={(body) => saveNote(selected.id, body)} />
        <section className="chainPanel"><div><span className="eyebrow">CONTENT-ADDRESSED HISTORY</span><h2>{snapshot.hashChains[selected.id]?.length ?? 0} immutable links</h2></div><ol>{[...(snapshot.hashChains[selected.id] ?? [])].reverse().slice(0, 4).map((link) => <li key={link.hash}><i /><code>{shortHash(link.hash)}</code><span>{new Date(link.createdAt).toLocaleString()}</span></li>)}</ol></section>
      </div> : <>
        <section className="statsGrid"><article><span className="statValue">{snapshot.notes.length}</span><span>monitored notes</span><i className="greenLine" /></article><article><span className="statValue">{pending.length}</span><span>pending decisions</span><i className="blueLine" /></article><article><span className="statValue">{checked}</span><span>source checks</span><i className="grayLine" /></article></section>
        <div className="dashboardGrid"><section className="notesPanel"><div className="panelHeader"><div><span className="eyebrow">REACTIVE LOOP</span><h2>Existing notes</h2></div><span>OpenAlex + Crossref</span></div>{snapshot.notes.map((note) => <article className="noteRow" key={note.id}><div className="noteGlyph">{note.title.charAt(0)}</div><div><Link href={`/notes/${note.id}`}>{note.title}</Link><code>{note.doi}</code></div><div className="rowHash"><span>HEAD</span><code>{shortHash(note.contentHash)}</code></div><button disabled={scanning === note.id} onClick={() => void scan(note.id)}>{scanning === note.id ? 'Scanning…' : 'Run scan now'}</button></article>)}</section>
          <section className="draftsPanel"><div className="panelHeader"><div><span className="eyebrow">HUMAN CONSENT</span><h2>Draft queue</h2></div><span className="blueBadge">{pending.length} PENDING</span></div>{pending.length ? pending.map((draft) => <DraftCard key={draft.id} draft={draft} onReview={openReview} />) : <div className="emptyState"><span>✓</span><h3>No pending edits</h3><p>Run a scan to reconcile stored citations.</p></div>}</section></div>
        <section className="auditStrip"><span className="eyebrow">LATEST AUDIT EVENTS</span><div>{snapshot.auditEvents.slice(-5).reverse().map((event) => <article key={event.id}><i /><code>{event.eventType}</code><span>{event.resourceId}</span><time>{new Date(event.createdAt).toLocaleTimeString()}</time></article>)}{snapshot.auditEvents.length === 0 && <p>No decisions yet. Checks and human actions append here.</p>}</div></section>
      </>}
    </main><ReviewDrawer />
  </div>;
}
