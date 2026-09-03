import { Pool } from 'pg';
import { createSessionStore } from './sessionStore';
import { createWorkspaceStore } from './workspaceStore';

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_NOT_CONFIGURED');
  pool ??= new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: true } : {}),
  });
  return pool;
}

export function getWorkspaceStore() {
  return createWorkspaceStore(getDatabasePool());
}

export function getSessionStore() {
  return createSessionStore(getDatabasePool());
}
