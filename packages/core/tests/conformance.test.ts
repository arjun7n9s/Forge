import { describe, expect, it, vi } from 'vitest';
import { registerConformantTool, validateToolRegistration } from '../src/webmcp/register.js';
import type { ModelContext, ModelContextTool } from '../src/webmcp/types.js';

const validTool: ModelContextTool = { name: 'verify_citation', description: 'Verify one DOI', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, execute: () => ({ ok: true }) };

describe('WebMCP conformance', () => {
  it('refuses wildcard and non-exact origins', () => {
    expect(validateToolRegistration(validTool, { exposedTo: ['*'] })).toEqual({ ok: false, code: 'EXPOSED_TO_WILDCARD' });
    expect(validateToolRegistration(validTool, { exposedTo: ['https://*.example.com'] })).toEqual({ ok: false, code: 'EXPOSED_TO_WILDCARD' });
  });

  it('requires secure origins except localhost', () => {
    expect(validateToolRegistration(validTool, { exposedTo: ['http://example.com'] })).toEqual({ ok: false, code: 'EXPOSED_TO_INSECURE' });
    expect(validateToolRegistration(validTool, { exposedTo: ['http://localhost:3000'] })).toEqual({ ok: true, warnings: [] });
  });

  it('requires schema and annotations', () => {
    const { inputSchema: _inputSchema, ...withoutSchema } = validTool;
    const { annotations: _annotations, ...withoutAnnotations } = validTool;
    expect(validateToolRegistration(withoutSchema, {})).toEqual({ ok: false, code: 'INPUT_SCHEMA_REQUIRED' });
    expect(validateToolRegistration(withoutAnnotations, {})).toEqual({ ok: false, code: 'ANNOTATIONS_MISSING' });
  });

  it('enforces name and description budgets', () => {
    expect(validateToolRegistration({ ...validTool, name: 'x'.repeat(31) }, {})).toEqual({ ok: false, code: 'NAME_TOO_LONG' });
    expect(validateToolRegistration({ ...validTool, description: 'x'.repeat(501) }, {})).toEqual({ ok: false, code: 'DESCRIPTION_TOO_LONG' });
  });

  it('passes AbortSignal to imperative registration', async () => {
    const registerTool = vi.fn(async () => undefined);
    const context = { registerTool } as unknown as ModelContext;
    const controller = new AbortController();
    await registerConformantTool(context, validTool, { exposedTo: ['https://forge.local'], signal: controller.signal });
    expect(registerTool).toHaveBeenCalledWith(validTool, { exposedTo: ['https://forge.local'], signal: controller.signal });
  });
});
