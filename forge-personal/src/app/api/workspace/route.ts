import { getSessionStore, getWorkspaceStore } from '@/lib/server/db';
import { createWorkspaceHandlers } from '@/lib/server/workspaceHandlers';

function handlers() {
  return createWorkspaceHandlers({
    sessionSecret: process.env.FORGE_SESSION_SECRET ?? '',
    store: getWorkspaceStore(),
    sessions: getSessionStore(),
  });
}

function unavailable(error: unknown): Response {
  const code = error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED' ? 'PERSISTENCE_NOT_CONFIGURED' : 'PERSISTENCE_UNAVAILABLE';
  return Response.json({ error: code }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request): Promise<Response> {
  try { return await handlers().GET(request); } catch (error) { return unavailable(error); }
}

export async function PUT(request: Request): Promise<Response> {
  try { return await handlers().PUT(request); } catch (error) { return unavailable(error); }
}
