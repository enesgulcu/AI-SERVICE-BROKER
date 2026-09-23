import { z } from 'zod';

const environmentSchema = z.enum(['local', 'development', 'staging', 'production', 'test']);

const baseEnvironmentSchema = z.object({
  NODE_ENV: environmentSchema.default('local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const apiEnvironmentSchema = baseEnvironmentSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

const workerEnvironmentSchema = baseEnvironmentSchema.extend({
  WORKER_NAME: z.string().trim().min(1).default('default'),
});

const databaseEnvironmentSchema = baseEnvironmentSchema.extend({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must use the PostgreSQL protocol',
    ),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function loadApiEnvironment(input: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return apiEnvironmentSchema.parse(input);
}

export function loadWorkerEnvironment(input: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  return workerEnvironmentSchema.parse(input);
}

export function loadDatabaseEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(input);
}
