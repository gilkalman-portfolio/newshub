/**
 * scripts/migrate.ts
 *
 * Runs the initial database migration against Supabase Postgres directly.
 * Requires the SUPABASE_DB_PASSWORD environment variable (not the anon/service key —
 * this is the actual Postgres password found in Supabase > Settings > Database).
 *
 * Run with:
 *   npx tsx scripts/migrate.ts
 *   # or via the npm script:
 *   npm run migrate
 *
 * Environment variables required (in .env.local):
 *   SUPABASE_DB_PASSWORD
 */

import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

async function migrate(): Promise<void> {
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!password) {
    console.error(
      '[migrate] ERROR: SUPABASE_DB_PASSWORD is not set.\n' +
        '         Get it from: Supabase dashboard → Settings → Database → Database password'
    );
    process.exit(1);
  }

  const connectionString =
    `postgresql://postgres.npsclkumumdvigggtaum:${password}` +
    `@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

  const sqlPath = join(process.cwd(), 'supabase', 'migrations', '001_init.sql');

  console.log('[migrate] Reading migration file:', sqlPath);
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = new Client({ connectionString });

  try {
    console.log('[migrate] Connecting to Supabase Postgres…');
    await client.connect();
    console.log('[migrate] Connected. Running migration…\n');

    await client.query(sql);

    console.log('\n[migrate] Migration completed successfully.');
  } catch (err) {
    console.error('\n[migrate] Migration FAILED:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('[migrate] Connection closed.');
  }
}

migrate();
