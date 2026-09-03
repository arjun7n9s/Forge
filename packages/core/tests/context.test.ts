import { describe, expect, it } from 'vitest';
import { resolveModelContext } from '../src/webmcp/context.js';
import type { ModelContext } from '../src/webmcp/types.js';

const documentContext = { getTools: async () => [] } as unknown as ModelContext;
const navigatorContext = { getTools: async () => [] } as unknown as ModelContext;

describe('WebMCP namespace compatibility', () => {
  it('prefers document.modelContext and falls back to navigator.modelContext', () => {
    expect(resolveModelContext({ document: { modelContext: documentContext }, navigator: { modelContext: navigatorContext } })).toBe(documentContext);
    expect(resolveModelContext({ navigator: { modelContext: navigatorContext } })).toBe(navigatorContext);
    expect(resolveModelContext({})).toBeUndefined();
  });
});
