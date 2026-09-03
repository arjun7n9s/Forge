import { getSessionStore } from '@/lib/server/db';
import { createSessionHandlers } from '@/lib/server/sessionHandlers';

function handlers() {
  return createSessionHandlers({
    accessKeyHash: process.env.FORGE_ACCESS_KEY_SHA256 ?? '',
    sessionSecret: process.env.FORGE_SESSION_SECRET ?? '',
    secureCookies: process.env.NODE_ENV === 'production',
    sessions: getSessionStore(),
  });
}

function unavailable(error: unknown): Response {
  const code = error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED' ? 'PERSISTENCE_NOT_CONFIGURED' : 'PERSISTENCE_UNAVAILABLE';
  return Response.json({ error: code }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  try { return await handlers().POST(request); } catch (error) { return unavailable(error); }
}

export async function DELETE(request: Request): Promise<Response> {
  try { return await handlers().DELETE(request); } catch (error) { return unavailable(error); }
}
