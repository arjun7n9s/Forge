import {
  ConformanceRegistrationError,
  validateToolRegistration,
  type ModelContext,
  type ModelContextTool,
  type ToolRegistrationCandidate,
} from '@forge/core';

export type ToolDefinition = ToolRegistrationCandidate;
export type ToolRegistrar = ModelContext['registerTool'];

export function registerConformantTool(registerTool: ToolRegistrar, tool: ToolDefinition, signal: AbortSignal): void {
  const options = { signal };
  const result = validateToolRegistration(tool, options);
  if (!result.ok) throw new ConformanceRegistrationError(result.code);
  void registerTool(tool as ModelContextTool, options);
}
