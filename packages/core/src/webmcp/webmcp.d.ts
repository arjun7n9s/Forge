import type {
  ModelContext as ForgeModelContext,
  ModelContextExecuteToolOptions as ForgeExecuteOptions,
  ModelContextGetToolOptions as ForgeGetOptions,
  ModelContextRegisterToolOptions as ForgeRegisterOptions,
  ModelContextTool as ForgeTool,
  ModelContextToolAnnotations as ForgeAnnotations,
  RegisteredTool as ForgeRegisteredTool,
} from './types.js';

declare global {
  interface ModelContextToolAnnotations extends ForgeAnnotations {}
  interface ModelContextTool extends ForgeTool {}
  interface ModelContextRegisterToolOptions extends ForgeRegisterOptions {}
  interface ModelContextGetToolOptions extends ForgeGetOptions {}
  interface ModelContextExecuteToolOptions extends ForgeExecuteOptions {}
  interface RegisteredTool extends ForgeRegisteredTool {}
  interface ModelContext extends ForgeModelContext {}
  interface Document { readonly modelContext?: ModelContext }
}
export {};
