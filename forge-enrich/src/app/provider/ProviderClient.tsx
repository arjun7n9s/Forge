'use client';

import { useEffect, useState } from 'react';
import { registerProviderTools } from '@/lib/webmcp/providerKit';
import { resolveModelContext } from '@forge/core';
import { originTrialAllowsWebMcp } from '@/lib/webmcp/originTrial';

const forgeOrigin = process.env.NEXT_PUBLIC_FORGE_ORIGIN ?? 'http://localhost:3000';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

export function ProviderClient() {
  const [state, setState] = useState<'probing' | 'registered' | 'unavailable' | 'error'>('probing');

  useEffect(() => {
    const controller = new AbortController();
    const modelContext = originTrialAllowsWebMcp() ? resolveModelContext() : undefined;
    if (!modelContext?.registerTool) {
      queueMicrotask(() => setState('unavailable'));
      return () => controller.abort();
    }
    const service = {
      verify: (doi: string) => post('/api/verify', { doi }),
      scan: async (dois: string[]) => {
        const payload = await post<{ results: unknown[] }>('/api/scan', { dois });
        return payload.results;
      },
    };
    void registerProviderTools(
      { registerTool: modelContext.registerTool.bind(modelContext) },
      service as never,
      forgeOrigin,
      controller.signal,
    ).then(() => setState('registered')).catch(() => setState('error'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== forgeOrigin || event.source !== window.parent) return;
      const message = event.data as { type?: string; requestId?: string; doi?: string };
      if (message.type !== 'forge:verify' || typeof message.requestId !== 'string' || typeof message.doi !== 'string') return;
      void post('/api/verify', { doi: message.doi })
        .then((result) => window.parent.postMessage({ type: 'forge:verify-result', requestId: message.requestId, result }, forgeOrigin))
        .catch(() => window.parent.postMessage({ type: 'forge:verify-result', requestId: message.requestId, result: { status: 'unknown', sources: {} } }, forgeOrigin));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <main className="providerShell" data-provider-state={state}>
    <div className="providerMark">F</div>
    <div><strong>FORGE enrichment provider</strong><span>{state === 'registered' ? '3 tools exposed to personal origin' : state === 'unavailable' ? 'WebMCP unavailable in this browser' : state === 'error' ? 'Registration refused' : 'Registering tools…'}</span></div>
    <i className={`stateDot ${state}`} aria-label={state} />
  </main>;
}
