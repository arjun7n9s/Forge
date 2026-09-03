import { registerConformantTool, type ToolDefinition, type ToolRegistrar } from './registerConformantTool';
import type { ModelContextToolResult } from '@forge/core';

export type EditorState = 'EDITOR_IDLE' | 'EDITOR_DRAFT_READY' | 'EDITOR_REVIEW_OPEN';
const OBJECT = { type: 'object', additionalProperties: false } as const;
const STRING = { type: 'string' } as const;
const INPUTS = {
  list_notes: { ...OBJECT, properties: {} },
  get_note: { ...OBJECT, properties: { note_id: STRING }, required: ['note_id'] },
  search_notes: { ...OBJECT, properties: { query: STRING }, required: ['query'] },
  get_drafts: { ...OBJECT, properties: {} },
  create_note: { ...OBJECT, properties: { title: STRING, body: STRING }, required: ['title', 'body'] },
  run_scan_now: { ...OBJECT, properties: { note_id: STRING }, required: ['note_id'] },
  propose_note_edit: { ...OBJECT, properties: { note_id: STRING, draft_payload: { type: 'object', additionalProperties: false, properties: { body: STRING }, required: ['body'] } }, required: ['note_id', 'draft_payload'] },
  confirm_edit: { ...OBJECT, properties: { edit_id: STRING }, required: ['edit_id'] },
  reject_edit: { ...OBJECT, properties: { edit_id: STRING, reason: STRING }, required: ['edit_id'] },
} as const;
const TOOL_NAMES = ['list_notes', 'get_note', 'search_notes', 'get_drafts', 'create_note', 'run_scan_now', 'propose_note_edit', 'confirm_edit', 'reject_edit'] as const;
export const PERSONAL_TOOL_NAMES = [...TOOL_NAMES];

export interface PersonalActions { [key: string]: (input: unknown) => ModelContextToolResult | Promise<ModelContextToolResult> }

function definition(name: typeof TOOL_NAMES[number], actions: PersonalActions): ToolDefinition {
  return {
    name,
    description: ({
      list_notes: 'List notes in this private citation workspace.', get_note: 'Read one note and its hash chain.', search_notes: 'Search private note text.',
      get_drafts: 'List mutable draft workflow records.', create_note: 'Create a private note.', run_scan_now: 'Scan one note using federated enrichment.',
      propose_note_edit: 'Propose an edit for a ready integrity draft.', confirm_edit: 'Confirm the visible reviewed edit.', reject_edit: 'Reject the visible reviewed edit.',
    })[name],
    inputSchema: INPUTS[name], annotations: { readOnlyHint: ['list_notes', 'get_note', 'search_notes', 'get_drafts'].includes(name) },
    execute: actions[name] ?? (() => ({ ok: true })),
  };
}

export function registerPersonalTools(context: { registerTool: ToolRegistrar }, options: { state: EditorState; actions?: PersonalActions }): AbortController {
  const controller = new AbortController();
  const names: typeof TOOL_NAMES[number][] = ['list_notes', 'get_note', 'search_notes', 'get_drafts', 'create_note', 'run_scan_now'];
  if (options.state === 'EDITOR_DRAFT_READY') names.push('propose_note_edit');
  if (options.state === 'EDITOR_REVIEW_OPEN') names.push('propose_note_edit', 'confirm_edit', 'reject_edit');
  for (const name of names) registerConformantTool(context.registerTool, definition(name, options.actions ?? {}), controller.signal);
  return controller;
}
