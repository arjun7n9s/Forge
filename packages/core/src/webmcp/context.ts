import type { ModelContext } from './types.js';

export interface ModelContextScope {
  document?: { modelContext?: ModelContext };
  navigator?: { modelContext?: ModelContext };
}

export function resolveModelContext(scope: ModelContextScope = globalThis as unknown as ModelContextScope): ModelContext | undefined {
  return scope.document?.modelContext ?? scope.navigator?.modelContext;
}
