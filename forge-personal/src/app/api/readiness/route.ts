import { getDatabasePool } from '@/lib/server/db';

export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!process.env.DATABASE_URL) {
    return Response.json({ service: 'forge-personal', status: 'not_configured', database: 'missing' }, { status: 503, headers });
  }
  try {
    await getDatabasePool().query('SELECT 1');
    return Response.json({ service: 'forge-personal', status: 'ready', database: 'connected' }, { headers });
  } catch {
    return Response.json({ service: 'forge-personal', status: 'unavailable', database: 'unreachable' }, { status: 503, headers });
  }
}
