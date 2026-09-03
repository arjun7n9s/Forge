export type ModelContextToolResult = string | { content: Array<{ type: 'text'; text: string }>; isError?: boolean } | object;

export interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations: ModelContextToolAnnotations;
  execute(input: unknown, context: { signal: AbortSignal }): Promise<ModelContextToolResult> | ModelContextToolResult;
}

export interface ModelContextRegisterToolOptions {
  exposedTo?: string[];
  signal?: AbortSignal;
}
export interface ModelContextGetToolOptions { fromOrigins?: string[] }
export interface ModelContextExecuteToolOptions { signal?: AbortSignal }

export interface RegisteredTool {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: object;
  annotations?: ModelContextToolAnnotations;
  origin?: string;
}

/** Imperative WebMCP API exposed at document.modelContext. */
export interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>;
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  executeTool(tool: RegisteredTool, inputObject?: object | string, options?: ModelContextExecuteToolOptions): Promise<string | null>;
  ontoolchange: ((this: ModelContext, event: Event) => unknown) | null;
}

export interface DiscoveredTool {
  origin: string;
  name: string;
  handle: RegisteredTool;
  description?: string;
  annotations?: ModelContextToolAnnotations;
}

export type OriginDiscovery =
  | { origin: string; state: 'ok'; tools: DiscoveredTool[]; ms: number }
  | { origin: string; state: 'timeout' | 'unavailable'; tools: []; ms: number; reason: string };

export type ExecuteOutcome =
  | { state: 'ok'; raw: string; ms: number }
  | { state: 'navigated' | 'timeout' | 'aborted'; ms: number }
  | { state: 'failed'; ms: number; reason: string };

export interface ProviderTransport {
  readonly kind: 'webmcp' | 'fallback';
  discover(origins: readonly string[], options?: { timeoutMs?: number }): Promise<OriginDiscovery[]>;
  execute(tool: DiscoveredTool, input: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ExecuteOutcome>;
}
export interface FallbackTransport extends ProviderTransport { readonly kind: 'fallback' }
