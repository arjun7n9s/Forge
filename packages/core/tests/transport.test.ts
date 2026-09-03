import { describe, expect, it, vi } from 'vitest';
import { selectTransport, WebMcpTransport } from '../src/webmcp/transport.js';
import type { ExecuteOutcome, FallbackTransport, ModelContext } from '../src/webmcp/types.js';

describe('transport selection', () => {
  it('uses WebMCP only after an actual capability probe finds tools', async () => {
    const context = { getTools: vi.fn(async () => [{ name: 'verify', origin: 'https://enrich.forge.local' }]), executeTool: vi.fn() } as unknown as ModelContext;
    const selected = await selectTransport({ context, probeOrigin: 'https://enrich.forge.local' });
    expect(selected.transport).toBeInstanceOf(WebMcpTransport);
    expect(selected.state).toEqual({ kind: 'webmcp', visibleLabel: 'WebMCP federation' });
  });

  it('returns a visible typed fallback state without implementing its bridge', async () => {
    const execute = vi.fn(async (): Promise<ExecuteOutcome> => ({ state: 'failed', ms: 0, reason: 'not wired' }));
    const fallback: FallbackTransport = { kind: 'fallback', discover: vi.fn(async () => []), execute };
    const context = { getTools: vi.fn(async () => []), executeTool: vi.fn() } as unknown as ModelContext;
    const selected = await selectTransport({ context, probeOrigin: 'https://enrich.forge.local', fallback });
    expect(selected).toEqual({ transport: fallback, state: { kind: 'fallback', visibleLabel: 'Fallback transport', reason: 'WebMCP capability probe found no tools' } });
  });
});
