import type {
  CallbackSaveResult,
  CallbackStatus,
  DeliveryCallbackRecord,
  DeliveryCallbackStore,
} from '@ai-service-broker/messaging';
import type { SqlPool } from '../database';

interface StatusRow extends Record<string, unknown> {
  status: CallbackStatus;
  template_version: string;
}

export class PostgresDeliveryCallbackStore implements DeliveryCallbackStore {
  constructor(private readonly pool: SqlPool) {}

  async save(input: DeliveryCallbackRecord): Promise<CallbackSaveResult> {
    const client = await this.pool.connect();
    try {
      const inserted = await client.query(
        `
          INSERT INTO outreach.delivery_callbacks (
            id, provider, provider_event_id, template_version, status
          )
          VALUES ($1, 'MOCK', $2, $3, $4)
          ON CONFLICT (provider, provider_event_id) DO NOTHING
        `,
        [input.id, input.providerEventId, input.templateVersion, input.status],
      );
      if (inserted.rowCount === 1) {
        return { ok: true, disposition: 'CREATED' };
      }
      const existing = await client.query<StatusRow>(
        `
          SELECT status, template_version
          FROM outreach.delivery_callbacks
          WHERE provider = 'MOCK' AND provider_event_id = $1
        `,
        [input.providerEventId],
      );
      const row = existing.rows[0];
      if (row?.status === input.status && row.template_version === input.templateVersion) {
        return { ok: true, disposition: 'DUPLICATE' };
      }
      return { ok: false, code: 'CALLBACK_CONFLICT' };
    } finally {
      client.release();
    }
  }
}
