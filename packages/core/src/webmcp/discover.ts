import type { DiscoveredTool, ModelContext, OriginDiscovery } from './types.js';

const DEFAULT_TIMEOUT_MS = 4_000;

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Query exactly one origin so every returned tool has unambiguous provenance. */
export async function discoverOrigin(
  context: ModelContext,
  origin: string,
  options: { timeoutMs?: number } = {},
): Promise<OriginDiscovery> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    const handles = await Promise.race([
      context.getTools({ fromOrigins: [origin] }),
      timeout,
    ]);
    const tools: DiscoveredTool[] = handles
      .filter((handle) => handle.origin === undefined || handle.origin === origin)
      .map((handle) => ({
        origin,
        name: handle.name,
        handle,
        ...(handle.description === undefined ? {} : { description: handle.description }),
        ...(handle.annotations === undefined ? {} : { annotations: handle.annotations }),
      }));
    return { origin, state: 'ok', tools, ms: Date.now() - started };
  } catch (error) {
    const reason = reasonOf(error);
    return {
      origin,
      state: reason === 'timeout' ? 'timeout' : 'unavailable',
      tools: [],
      ms: Date.now() - started,
      reason,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Discover independently; each call probes only its own origin. */
export function discoverOrigins(
  context: ModelContext,
  origins: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<OriginDiscovery[]> {
  return Promise.all(origins.map((origin) => discoverOrigin(context, origin, options)));
}

export function toolKey(origin: string, name: string): string {
  return `${origin}|${name}`;
}

export function indexByOriginAndName(discoveries: readonly OriginDiscovery[]): Map<string, DiscoveredTool> {
  const index = new Map<string, DiscoveredTool>();
  for (const discovery of discoveries) {
    for (const tool of discovery.tools) index.set(toolKey(tool.origin, tool.name), tool);
  }
  return index;
}
