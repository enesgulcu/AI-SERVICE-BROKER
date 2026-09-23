import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SqlPool } from './database';

const MIGRATION_LOCK_NAME = 'ai-service-broker:migrations';
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

interface AppliedMigrationRow extends Record<string, unknown> {
  version: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function runMigrations(
  pool: SqlPool,
  migrationsDirectory: string,
): Promise<MigrationResult> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    lockAcquired = true;
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        version text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
      )
    `);

    const appliedResult = await client.query<AppliedMigrationRow>(
      'SELECT version, checksum FROM platform.schema_migrations ORDER BY version',
    );
    const appliedChecksums = new Map(
      appliedResult.rows.map((row) => [row.version, row.checksum.trim()]),
    );
    const files = (await readdir(migrationsDirectory))
      .filter((file) => MIGRATION_FILE.test(file))
      .sort();
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      const sql = await readFile(join(migrationsDirectory, file), 'utf8');
      const migrationChecksum = checksum(sql);
      const existingChecksum = appliedChecksums.get(file);

      if (existingChecksum) {
        if (existingChecksum !== migrationChecksum) {
          throw new Error(`Applied migration checksum mismatch: ${file}`);
        }
        result.skipped.push(file);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.execute(sql);
        await client.query(
          'INSERT INTO platform.schema_migrations (version, checksum) VALUES ($1, $2)',
          [file, migrationChecksum],
        );
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return result;
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    }
    client.release();
  }
}
