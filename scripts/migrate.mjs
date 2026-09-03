import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString, max: 1, ...(process.env.DATABASE_SSL === 'true' ? { ssl: true } : {}) });
try {
  for (const file of ['001_schema.sql', '002_workspace_state.sql']) {
    const sql = await readFile(resolve(import.meta.dirname, '../infra/sql', file), 'utf8');
    await pool.query(sql);
    process.stdout.write(`applied ${file}\n`);
  }
} finally {
  await pool.end();
}
