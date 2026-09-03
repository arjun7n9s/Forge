import {
  normalizeDoi,
  parseVerificationResult,
  selectTransport,
  type FallbackTransport,
  type ModelContext,
  type ProviderTransport,
  type VerificationFirewallResult,
} from '@forge/core';
import type { CitationResult } from '@/lib/domain/types';

export const ENRICH_ORIGIN = process.env.NEXT_PUBLIC_ENRICH_ORIGIN ?? 'http://localhost:3001';
const UNKNOWN: CitationResult = { status: 'unknown', sources: {} };

interface TransportOptions {
  modelContext?: ModelContext;
  enrichOrigin: string;
  compatibilityRequest?: (origin: string, doi: string) => Promise<unknown>;
  onFirewallRejected?: (error: Extract<VerificationFirewallResult, { ok: false }>['error']) => void;
}
export interface CitationTransport {
  kind: 'webmcp' | 'compatibility';
  label: 'Cross-origin WebMCP' | 'Compatibility transport';
  verify(doi: string): Promise<CitationResult>;
}

function project(result: VerificationFirewallResult, rejected?: TransportOptions['onFirewallRejected']): CitationResult {
  if (!result.ok) {
    rejected?.(result.error);
    return UNKNOWN;
  }
  const { status, sources } = result.value;
  return result.value.cardType === undefined ? { status, sources } : { status, cardType: result.value.cardType, sources };
}

export function compatibilityPostMessage(origin: string, doi: string): Promise<unknown> {
  return new Promise((resolve) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-enrichment-provider]');
    if (!frame?.contentWindow) return resolve(null);
    const requestId = crypto.randomUUID();
    const retryDelays = [0, 400, 1_200];
    const timers: number[] = [];
    const send = () => frame.contentWindow?.postMessage({ type: 'forge:verify', requestId, doi }, origin);
    for (const delay of retryDelays) timers.push(window.setTimeout(send, delay));
    const timeout = window.setTimeout(() => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, 4_000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== frame?.contentWindow) return;
      const data = event.data as { type?: string; requestId?: string; result?: unknown };
      if (data.type !== 'forge:verify-result' || data.requestId !== requestId) return;
      timers.forEach(window.clearTimeout);
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(data.result);
    }
    window.addEventListener('message', onMessage);
  });
}

function fallbackTransport(): FallbackTransport {
  return {
    kind: 'fallback',
    async discover() { return []; },
    async execute() { return { state: 'failed', ms: 0, reason: 'compatibility bridge executes by DOI' }; },
  };
}

export function createCompatibilityCitationTransport(options: TransportOptions): CitationTransport {
  const request = options.compatibilityRequest ?? compatibilityPostMessage;
  return {
    kind: 'compatibility',
    label: 'Compatibility transport',
    async verify(input: string) {
      const doi = normalizeDoi(input);
      if (doi === null) return UNKNOWN;
      try { return project(parseVerificationResult(await request(options.enrichOrigin, doi)), options.onFirewallRejected); }
      catch { return UNKNOWN; }
    },
  };
}

export async function createCitationTransport(options: TransportOptions): Promise<CitationTransport> {
  let provider: ProviderTransport | undefined;
  if (options.modelContext) {
    const selected = await selectTransport({
      context: options.modelContext,
      probeOrigin: options.enrichOrigin,
      timeoutMs: 4_000,
      fallback: fallbackTransport(),
    });
    if (selected.state.kind === 'webmcp') provider = selected.transport;
  }

  if (provider) {
    return {
      kind: 'webmcp',
      label: 'Cross-origin WebMCP',
      async verify(input: string) {
        const doi = normalizeDoi(input);
        if (doi === null) return UNKNOWN;
        const [discovery] = await provider.discover([options.enrichOrigin], { timeoutMs: 4_000 });
        const tool = discovery?.state === 'ok' ? discovery.tools.find((candidate) => candidate.name === 'verify_citation') : undefined;
        if (!tool) return UNKNOWN;
        const outcome = await provider.execute(tool, { doi }, { timeoutMs: 4_000 });
        return outcome.state === 'ok' ? project(parseVerificationResult(outcome.raw), options.onFirewallRejected) : UNKNOWN;
      },
    };
  }
  return createCompatibilityCitationTransport(options);
}
