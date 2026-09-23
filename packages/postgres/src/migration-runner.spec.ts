import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SqlClient, SqlPool, SqlQueryResult } from './database';
import { runMigrations } from './migration-runner';

interface ScriptStep {
  includes: string;
  result?: SqlQueryResult<Record<string, unknown>>;
}

class ScriptedClient implements SqlClient {
  readonly calls: string[] = [];
  released = false;

  constructor(private readonly script: ScriptStep[]) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push(text);
    const step = this.script.shift();
    if (!step) {
      throw new Error(`Unexpected query: ${text}`);
    }
    expect(text).toContain(step.includes);
    return Promise.resolve((step.result ?? { rows: [], rowCount: null }) as SqlQueryResult<Row>);
  }

  execute(text: string): Promise<void> {
    this.calls.push(text);
    const step = this.script.shift();
    if (!step) {
      throw new Error(`Unexpected script: ${text}`);
    }
    expect(text).toContain(step.includes);
    return Promise.resolve();
  }

  release(): void {
    this.released = true;
  }

  assertComplete(): void {
    expect(this.script).toHaveLength(0);
  }
}

class SingleClientPool implements SqlPool {
  constructor(readonly client: ScriptedClient) {}

  connect(): Promise<SqlClient> {
    return Promise.resolve(this.client);
  }

  end(): Promise<void> {
    return Promise.resolve();
  }
}

describe('runMigrations', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ai-service-broker-migrations-'));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('applies a pending migration under an advisory lock', async () => {
    const sql = [
      'CREATE TABLE example (id uuid PRIMARY KEY);',
      'CREATE INDEX example_id_idx ON example (id);',
    ].join('\n');
    await writeFile(join(directory, '0001_create_example.sql'), sql);
    const client = new ScriptedClient([
      { includes: 'pg_advisory_lock' },
      { includes: 'CREATE SCHEMA' },
      { includes: 'CREATE TABLE IF NOT EXISTS platform.schema_migrations' },
      {
        includes: 'SELECT version, checksum',
        result: { rows: [], rowCount: 0 },
      },
      { includes: 'BEGIN' },
      { includes: 'CREATE TABLE example' },
      { includes: 'INSERT INTO platform.schema_migrations' },
      { includes: 'COMMIT' },
      { includes: 'pg_advisory_unlock' },
    ]);

    await expect(runMigrations(new SingleClientPool(client), directory)).resolves.toEqual({
      applied: ['0001_create_example.sql'],
      skipped: [],
    });
    expect(client.released).toBe(true);
    expect(client.calls.filter((call) => call.includes('CREATE INDEX example_id_idx'))).toEqual([
      sql,
    ]);
    client.assertComplete();
  });

  it('accepts a stored checksum that PostgreSQL char padding has widened', async () => {
    const sql = 'CREATE TABLE example (id uuid PRIMARY KEY);';
    await writeFile(join(directory, '0001_create_example.sql'), sql);
    const checksum = createHash('sha256').update(sql).digest('hex');
    const client = new ScriptedClient([
      { includes: 'pg_advisory_lock' },
      { includes: 'CREATE SCHEMA' },
      { includes: 'CREATE TABLE IF NOT EXISTS platform.schema_migrations' },
      {
        includes: 'SELECT version, checksum',
        result: {
          rows: [
            {
              version: '0001_create_example.sql',
              checksum: `${checksum} `,
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'pg_advisory_unlock' },
    ]);

    await expect(runMigrations(new SingleClientPool(client), directory)).resolves.toEqual({
      applied: [],
      skipped: ['0001_create_example.sql'],
    });
    client.assertComplete();
  });

  it('refuses to run when an applied migration was modified', async () => {
    await writeFile(
      join(directory, '0001_create_example.sql'),
      'CREATE TABLE changed (id uuid PRIMARY KEY);',
    );
    const client = new ScriptedClient([
      { includes: 'pg_advisory_lock' },
      { includes: 'CREATE SCHEMA' },
      { includes: 'CREATE TABLE IF NOT EXISTS platform.schema_migrations' },
      {
        includes: 'SELECT version, checksum',
        result: {
          rows: [
            {
              version: '0001_create_example.sql',
              checksum: '0'.repeat(64),
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'pg_advisory_unlock' },
    ]);

    await expect(runMigrations(new SingleClientPool(client), directory)).rejects.toThrow(
      'Applied migration checksum mismatch',
    );
    expect(client.released).toBe(true);
    client.assertComplete();
  });
});
