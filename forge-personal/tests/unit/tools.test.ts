import { describe, expect, it, vi } from 'vitest';
import { registerPersonalTools } from '@/lib/webmcp/registerTools';
import type { ModelContextTool } from '@forge/core';

describe('state-aware personal tools', () => {
  it('registers six always tools, proposal when ready, and gates review tools', () => {
    const names = new Set<string>();
    const registerTool = vi.fn(async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
      names.add(tool.name);
      options?.signal?.addEventListener('abort', () => names.delete(tool.name));
    });
    const base = registerPersonalTools({ registerTool }, { state: 'EDITOR_IDLE' });
    expect([...names].sort()).toEqual(['create_note', 'get_drafts', 'get_note', 'list_notes', 'run_scan_now', 'search_notes']);
    base.abort();
    expect(names.size).toBe(0);

    const ready = registerPersonalTools({ registerTool }, { state: 'EDITOR_DRAFT_READY' });
    expect(names.has('propose_note_edit')).toBe(true);
    expect(names.has('confirm_edit')).toBe(false);
    expect(names.has('reject_edit')).toBe(false);
    ready.abort();

    const review = registerPersonalTools({ registerTool }, { state: 'EDITOR_REVIEW_OPEN' });
    expect(names.has('confirm_edit')).toBe(true);
    expect(names.has('reject_edit')).toBe(true);
    review.abort();
    expect(names.size).toBe(0);
  });

  it('publishes input schemas for every tool that accepts arguments', () => {
    const tools = new Map<string, ModelContextTool>();
    const registerTool = vi.fn(async (tool: ModelContextTool) => { tools.set(tool.name, tool); });
    const controller = registerPersonalTools({ registerTool }, { state: 'EDITOR_REVIEW_OPEN' });
    expect(((tools.get('get_note')?.inputSchema as Record<string, unknown>).properties as Record<string, unknown>)).toHaveProperty('note_id');
    expect(((tools.get('create_note')?.inputSchema as Record<string, unknown>).properties as Record<string, unknown>)).toHaveProperty('body');
    expect(((tools.get('confirm_edit')?.inputSchema as Record<string, unknown>).properties as Record<string, unknown>)).toHaveProperty('edit_id');
    controller.abort();
  });
});
