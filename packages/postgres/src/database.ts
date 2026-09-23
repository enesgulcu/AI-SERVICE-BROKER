import { Pool, type PoolClient, type PoolConfig } from 'pg';

export interface SqlQueryResult<Row extends Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface SqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
}

class NodePostgresClient implements SqlClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query<Row>(text, [...values]);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  }

  release(): void {
    this.client.release();
  }
}

class NodePostgresPool implements SqlPool {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async connect(): Promise<SqlClient> {
    return new NodePostgresClient(await this.pool.connect());
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

export interface CreatePostgresPoolOptions {
  connectionString: string;
  ssl: 'disable' | 'require';
  applicationName: string;
  max?: number;
}

export function createPostgresPool(options: CreatePostgresPoolOptions): SqlPool {
  return new NodePostgresPool({
    application_name: options.applicationName,
    connectionString: options.connectionString,
    max: options.max ?? 10,
    ssl: options.ssl === 'require' ? { rejectUnauthorized: true } : false,
  });
}
