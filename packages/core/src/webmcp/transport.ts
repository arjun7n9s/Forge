import { discoverOrigins } from './discover.js';
import { executeWebMcpTool } from './execute.js';
import type {
  DiscoveredTool,
  ExecuteOutcome,
  FallbackTransport,
  ModelContext,
  OriginDiscovery,
  ProviderTransport,
} from './types.js';

export interface TransportState {
  kind: 'webmcp' | 'fallback';
  visibleLabel: string;
  reason?: string;
}

export interface SelectedTransport {
  transport: ProviderTransport;
  state: TransportState;
}

export class WebMcpTransport implements ProviderTransport {
  readonly kind = 'webmcp' as const;

  constructor(private readonly context: ModelContext) {}

  discover(origins: readonly string[], options: { timeoutMs?: number } = {}): Promise<OriginDiscovery[]> {
    return discoverOrigins(this.context, origins, options);
  }

  execute(
    tool: DiscoveredTool,
    input: unknown,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ExecuteOutcome> {
    return executeWebMcpTool(this.context, tool, input, options);
  }
}

function unavailableFallback(): FallbackTransport {
  return {
    kind: 'fallback',
    async discover() { return []; },
    async execute() { return { state: 'failed', ms: 0, reason: 'fallback transport not configured' }; },
  };
}

/** Select WebMCP only after a real one-origin capability probe finds a tool. */
export async function selectTransport(options: {
  context: ModelContext;
  probeOrigin: string;
  timeoutMs?: number;
  fallback?: FallbackTransport;
}): Promise<SelectedTransport> {
  const probeOptions = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
  const [probe] = await discoverOrigins(options.context, [options.probeOrigin], probeOptions);
  if (probe?.state === 'ok' && probe.tools.length > 0) {
    return {
      transport: new WebMcpTransport(options.context),
      state: { kind: 'webmcp', visibleLabel: 'WebMCP federation' },
    };
  }

  return {
    transport: options.fallback ?? unavailableFallback(),
    state: {
      kind: 'fallback',
      visibleLabel: 'Fallback transport',
      reason: probe?.state === 'ok'
        ? 'WebMCP capability probe found no tools'
        : 'WebMCP capability probe unavailable',
    },
  };
}
