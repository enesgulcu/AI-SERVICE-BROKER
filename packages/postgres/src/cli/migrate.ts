import { loadDatabaseEnvironment } from '@ai-service-broker/config';
import { resolve } from 'node:path';
import { createPostgresPool } from '../database';
import { runMigrations } from '../migration-runner';

async function main(): Promise<void> {
  const environment = loadDatabaseEnvironment();
  const pool = createPostgresPool({
    applicationName: 'ai-service-broker-migrations',
    connectionString: environment.DATABASE_URL,
    ssl: environment.DATABASE_SSL,
    max: 1,
  });

  try {
    const result = await runMigrations(pool, resolve(__dirname, '../../migrations'));
    console.info('Migrations completed', {
      applied: result.applied,
      skipped: result.skipped,
    });
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown migration error';
  console.error('Migration failed', { message });
  process.exitCode = 1;
});
