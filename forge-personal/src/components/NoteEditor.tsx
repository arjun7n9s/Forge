'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CitationResult } from '@/lib/domain/types';
import { createDoiVerifier, extractCompleteDois } from '@/lib/doi/checker';
import { shouldWarnOnSave } from '@/lib/domain/integrity';
import { CitationChip } from './CitationChip';

export function NoteEditor({ initialBody, verify, onSave, debounceMs = 450 }: { initialBody: string; verify: (doi: string) => Promise<CitationResult>; onSave: (body: string) => void | Promise<void>; debounceMs?: number }) {
  const [body, setBody] = useState(initialBody); const [checked, setChecked] = useState<{ doi: string; result: CitationResult }>(); const [warning, setWarning] = useState(false);
  const verifier = useMemo(() => createDoiVerifier(verify, debounceMs), [verify, debounceMs]);
  const doi = extractCompleteDois(body).at(-1);
  const result = checked && checked.doi === doi ? checked.result : undefined;
  const checking = Boolean(doi && checked?.doi !== doi);
  useEffect(() => {
    if (!doi) return;
    let active = true;
    void verifier.schedule(doi).then((value) => { if (active) setChecked({ doi, result: value }); }).catch(() => { if (active) setChecked({ doi, result: { status: 'unknown', sources: {} } }); });
    return () => { active = false; };
  }, [doi, verifier]);
  const save = () => { if (result && shouldWarnOnSave(result.status)) { setWarning(true); return; } void onSave(body); };
  return <section className="editorPanel" aria-label="Preventive citation editor">
    <div className="editorToolbar"><span>MARKDOWN NOTE</span><span className="checkStatus">{checking ? 'Checking citation…' : result ? 'Integrity check complete' : 'Ready'}</span></div>
    <textarea aria-label="Note body" className="noteTextarea" value={body} onChange={(event) => setBody(event.target.value)} spellCheck />
    <div className="citationReadout">
      <div><span className="eyebrow">CITATION LENS</span>{doi ? <div className={`doiTreatment ${result?.status ?? 'unknown'}`} data-testid="citation-doi">{doi}</div> : <p className="muted">A complete DOI activates preventive verification.</p>}</div>
      {result && <CitationChip status={result.status} />}
    </div>
    <div className="editorActions"><span className="muted">Every save extends the note’s SHA-256 chain.</span><button className="primaryButton" onClick={save}>Save note</button></div>
    {warning && <div className="dialogBackdrop"><div className="warningDialog" role="alertdialog" aria-modal="true" aria-labelledby="warning-title"><span className="warningMark">!</span><h2 id="warning-title">Retracted citation present</h2><p>Saving is allowed, but this DOI is marked retracted. Acknowledge the integrity risk to continue.</p><div className="dialogActions"><button className="quietButton" onClick={() => setWarning(false)}>Return to note</button><button className="dangerButton" onClick={() => { setWarning(false); void onSave(body); }}>Save with warning acknowledged</button></div></div></div>}
  </section>;
}
