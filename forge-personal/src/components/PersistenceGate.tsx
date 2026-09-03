'use client';

import { useState, type FormEvent } from 'react';
import type { PersistenceMode } from '@/lib/store/persistenceClient';

interface PersistenceGateProps {
  mode: PersistenceMode;
  reason?: string | undefined;
  revision?: number;
  login(accessKey: string): Promise<boolean>;
  logout?: () => Promise<void>;
}

export function PersistenceGate({ mode, reason, revision, login, logout }: PersistenceGateProps) {
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState(false);

  if (mode === 'locked') {
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      setSubmitting(true);
      setInvalid(false);
      try {
        const accepted = await login(accessKey);
        setAccessKey('');
        setInvalid(!accepted);
      } catch {
        setInvalid(true);
      } finally {
        setSubmitting(false);
      }
    };
    return <main className="unlockScreen">
      <div className="unlockCard">
        <span className="brandBlock">F</span>
        <span className="eyebrow">PRIVATE WORKSPACE</span>
        <h1>Unlock FORGE</h1>
        <p>The access key is exchanged for an HttpOnly session and is never stored in the browser.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="workspace-key">Workspace access key</label>
          <input id="workspace-key" type="password" value={accessKey} minLength={12} autoComplete="current-password" onChange={(event) => setAccessKey(event.target.value)} required />
          {invalid && <span role="alert">Access key rejected.</span>}
          <button type="submit" disabled={submitting}>{submitting ? 'Unlocking…' : 'Unlock workspace'}</button>
        </form>
      </div>
    </main>;
  }

  if (mode === 'local') return <div className="persistenceBanner local" role="status"><strong>Local-only mode</strong><span>Browser cache only; this is not durable server storage.</span>{reason && <code>{reason}</code>}</div>;
  if (mode === 'conflict') return <div className="persistenceBanner conflict" role="alert"><strong>Save conflict</strong><span>A newer server revision exists. Reload before editing again.</span></div>;
  if (mode === 'error') return <div className="persistenceBanner conflict" role="alert"><strong>Persistence failed</strong><span>{reason ?? 'The last change is not confirmed durable.'}</span></div>;
  if (mode === 'server') return <div className="persistenceBanner server" role="status"><strong>Durable workspace</strong><span>PostgreSQL revision {revision ?? 0}</span>{logout && <button type="button" className="quietButton" onClick={() => void logout()}>Log out</button>}</div>;
  return null;
}
