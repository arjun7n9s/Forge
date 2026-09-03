import type { DiscoveredTool, ExecuteOutcome, ModelContext } from './types.js';

const DEFAULT_TIMEOUT_MS = 2_000;
type ArgumentEncoding = 'object' | 'json-string';
let latchedEncoding: ArgumentEncoding | null = null;

export function resetArgumentEncodingLatch(): void {
  latchedEncoding = null;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function looksLikeEncodingMismatch(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('not an object')
    || normalized.includes('cannot convert')
    || normalized.includes('is not a valid')
    || normalized.includes('failed to execute')
    || normalized.includes('typeerror')
    || normalized.includes('argument');
}

function payload(input: unknown, encoding: ArgumentEncoding): object | string {
  if (encoding === 'json-string') return JSON.stringify(input);
  return input !== null && typeof input === 'object' ? input : { value: input };
}

/** Execute without throwing; timeout, abort, and navigation are explicit values. */
export async function executeWebMcpTool(
  context: ModelContext,
  tool: DiscoveredTool,
  input: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ExecuteOutcome> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  if (options.signal?.aborted) return { state: 'aborted', ms: elapsed() };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const terminal = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (options.signal !== undefined) {
      abortListener = () => {
        controller.abort();
        reject(new Error('aborted'));
      };
      options.signal.addEventListener('abort', abortListener, { once: true });
    }
  });

  const order: readonly ArgumentEncoding[] = latchedEncoding === null
    ? ['object', 'json-string']
    : [latchedEncoding];
  let lastReason = 'unknown';

  try {
    for (let index = 0; index < order.length; index += 1) {
      const encoding = order[index]!;
      try {
        const result = await Promise.race([
          context.executeTool(tool.handle, payload(input, encoding), { signal: controller.signal }),
          terminal,
        ]);
        latchedEncoding = encoding;
        return result === null
          ? { state: 'navigated', ms: elapsed() }
          : { state: 'ok', raw: result, ms: elapsed() };
      } catch (error) {
        const reason = errorReason(error);
        if (reason === 'aborted' || options.signal?.aborted) return { state: 'aborted', ms: elapsed() };
        if (reason === 'timeout') return { state: 'timeout', ms: elapsed() };
        lastReason = reason;
        if (index + 1 >= order.length || !looksLikeEncodingMismatch(reason)) break;
      }
    }
    return { state: 'failed', ms: elapsed(), reason: lastReason };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (options.signal !== undefined && abortListener !== undefined) {
      options.signal.removeEventListener('abort', abortListener);
    }
  }
}
