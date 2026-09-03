import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverOrigins } from '../src/webmcp/discover.js';
import { executeWebMcpTool, resetArgumentEncodingLatch } from '../src/webmcp/execute.js';
import type { ModelContext, RegisteredTool } from '../src/webmcp/types.js';

const handle: RegisteredTool = { name: 'verify_citation', origin: 'https://enrich.forge.local' };
const tool = { origin: 'https://enrich.forge.local', name: handle.name, handle };

beforeEach(() => resetArgumentEncodingLatch());

describe('WebMCP federation', () => {
  it('discovers fromOrigins one at a time and filters attributed self tools', async () => {
    const getTools = vi.fn(async ({ fromOrigins }: { fromOrigins?: string[] }) => [handle, { name: 'self', origin: 'https://forge.local' }]);
    const context = { getTools, executeTool: vi.fn() } as unknown as ModelContext;
    const result = await discoverOrigins(context, ['https://enrich.forge.local', 'https://other.example']);
    expect(getTools.mock.calls.map(([options]) => options?.fromOrigins)).toEqual([['https://enrich.forge.local'], ['https://other.example']]);
    expect(result[0]?.tools.map((item) => item.name)).toEqual(['verify_citation']);
  });

  it('treats null as navigation', async () => {
    const context = { executeTool: vi.fn(async () => null) } as unknown as ModelContext;
    expect(await executeWebMcpTool(context, tool, {})).toMatchObject({ state: 'navigated' });
  });

  it('reports timeout and abort explicitly', async () => {
    const never = new Promise<string>(() => undefined);
    const context = { executeTool: vi.fn(() => never) } as unknown as ModelContext;
    expect(await executeWebMcpTool(context, tool, {}, { timeoutMs: 5 })).toMatchObject({ state: 'timeout' });
    const controller = new AbortController(); controller.abort();
    expect(await executeWebMcpTool(context, tool, {}, { signal: controller.signal })).toMatchObject({ state: 'aborted' });
  });

  it('retries JSON-string only for encoding mismatch then latches it', async () => {
    const executeTool = vi.fn(async (_tool: RegisteredTool, input: object | string) => {
      if (typeof input !== 'string') throw new TypeError('argument is not a valid object encoding');
      return '{"ok":true}';
    });
    const context = { executeTool } as unknown as ModelContext;
    expect(await executeWebMcpTool(context, tool, { doi: '10.1/x' })).toMatchObject({ state: 'ok' });
    expect(executeTool).toHaveBeenCalledTimes(2);
    await executeWebMcpTool(context, tool, { doi: '10.1/y' });
    expect(typeof executeTool.mock.calls[2]?.[1]).toBe('string');
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  it('does not retry provider validation failures', async () => {
    const executeTool = vi.fn(async () => { throw new Error('invalid DOI'); });
    const context = { executeTool } as unknown as ModelContext;
    expect(await executeWebMcpTool(context, tool, {})).toMatchObject({ state: 'failed', reason: 'invalid DOI' });
    expect(executeTool).toHaveBeenCalledOnce();
  });
});
