import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadDatabaseEnvironment } from '@ai-service-broker/config';
import { createPostgresPool } from '../database';
import { runMigrations } from '../migration-runner';
import { PostgresCommercialStore } from './postgres-commercial.store';

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite('container-backed commercial records', () => {
  jest.setTimeout(30_000);

  it('migrates, writes a sandbox quote, and deletes only that row', async () => {
    const environment = loadDatabaseEnvironment();
    const pool = createPostgresPool({
      applicationName: 'ai-service-broker-integration',
      connectionString: environment.DATABASE_URL,
      ssl: environment.DATABASE_SSL,
      max: 2,
    });
    const leadId = randomUUID();
    const quoteId = randomUUID();
    const sourceReference = `integration-${leadId}`;
    try {
      await runMigrations(pool, resolve(__dirname, '../../migrations'));
      const client = await pool.connect();
      try {
        await client.query(
          `
            INSERT INTO acquisition.leads (id, status, source, source_reference, phone, received_at)
            VALUES ($1, 'NEW', 'SYNTHETIC', $2, '+905550019001', transaction_timestamp())
          `,
          [leadId, sourceReference],
        );
      } finally {
        client.release();
      }

      const store = new PostgresCommercialStore(pool);
      const fingerprint = 'a'.repeat(64);
      await expect(
        store.save({
          id: quoteId,
          leadId,
          kind: 'QUOTE',
          idempotencyKey: `quote:${leadId}`,
          fingerprint,
          payload: {
            version: 1,
            totalMinor: 4,
            currency: 'TRY',
            binding: false,
            authority: 'SANDBOX',
            tariff: false,
            contract: false,
          },
        }),
      ).resolves.toBe('CREATED');
      const listed = await store.listForLead(leadId, 'QUOTE');
      expect(listed).toHaveLength(1);
      expect(listed[0]?.payload.totalMinor).toBe(4);
      expect(JSON.stringify(listed)).not.toContain('+905550019001');
    } finally {
      const client = await pool.connect();
      try {
        await client.query('DELETE FROM commercial.records WHERE lead_id = $1', [leadId]);
        await client.query('DELETE FROM acquisition.leads WHERE id = $1', [leadId]);
      } finally {
        client.release();
        await pool.end();
      }
    }
  });
});
