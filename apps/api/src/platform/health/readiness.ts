export const READINESS_PROBE = Symbol('READINESS_PROBE');

export type DatabaseCheck = 'ok' | 'skipped' | 'unavailable';

export interface ReadinessProbe {
  checkDatabase(): Promise<DatabaseCheck>;
}
