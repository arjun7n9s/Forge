import type { ModelContext, ModelContextRegisterToolOptions, ModelContextTool } from './types.js';

export const WEBMCP_BUDGETS = { nameChars: 30, descriptionChars: 500, parameterDescriptionChars: 150 } as const;
export type ConformanceErrorCode = 'EXPOSED_TO_WILDCARD' | 'EXPOSED_TO_INSECURE' | 'INPUT_SCHEMA_REQUIRED' | 'NAME_TOO_LONG' | 'DESCRIPTION_TOO_LONG' | 'ANNOTATIONS_MISSING' | 'INVALID_NAME' | 'DESCRIPTION_REQUIRED';
export interface BudgetWarning { field: string; actual: number; budget: number }
export type ConformanceResult = { ok: true; warnings: BudgetWarning[] } | { ok: false; code: ConformanceErrorCode };
export type ToolRegistrationCandidate = Omit<ModelContextTool, 'inputSchema' | 'annotations'> & { inputSchema?: object; annotations?: ModelContextTool['annotations'] };

const NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;
function isSecureExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== value) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'));
  } catch { return false; }
}

export function validateToolRegistration(tool: ToolRegistrationCandidate, options: ModelContextRegisterToolOptions): ConformanceResult {
  if (options.exposedTo?.some((origin) => origin.includes('*') || origin.trim() === '')) return { ok: false, code: 'EXPOSED_TO_WILDCARD' };
  if (options.exposedTo?.some((origin) => !isSecureExactOrigin(origin))) return { ok: false, code: 'EXPOSED_TO_INSECURE' };
  if (!NAME_RE.test(tool.name)) return { ok: false, code: 'INVALID_NAME' };
  if (tool.name.length > WEBMCP_BUDGETS.nameChars) return { ok: false, code: 'NAME_TOO_LONG' };
  if (tool.description.trim() === '') return { ok: false, code: 'DESCRIPTION_REQUIRED' };
  if (tool.description.length > WEBMCP_BUDGETS.descriptionChars) return { ok: false, code: 'DESCRIPTION_TOO_LONG' };
  if (tool.inputSchema === undefined) return { ok: false, code: 'INPUT_SCHEMA_REQUIRED' };
  if (tool.annotations === undefined) return { ok: false, code: 'ANNOTATIONS_MISSING' };
  const warnings: BudgetWarning[] = [];
  const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  for (const [name, raw] of Object.entries(properties)) {
    const description = typeof raw === 'object' && raw !== null ? (raw as { description?: unknown }).description : undefined;
    if (typeof description === 'string' && description.length > WEBMCP_BUDGETS.parameterDescriptionChars) warnings.push({ field: `inputSchema.${name}.description`, actual: description.length, budget: WEBMCP_BUDGETS.parameterDescriptionChars });
  }
  return { ok: true, warnings };
}

export class ConformanceRegistrationError extends Error {
  constructor(readonly code: ConformanceErrorCode) { super(code); this.name = 'ConformanceRegistrationError'; }
}

export async function registerConformantTool(context: Pick<ModelContext, 'registerTool'>, tool: ToolRegistrationCandidate, options: ModelContextRegisterToolOptions = {}): Promise<void> {
  const result = validateToolRegistration(tool, options);
  if (!result.ok) throw new ConformanceRegistrationError(result.code);
  await context.registerTool(tool as ModelContextTool, options);
}
