import {
  isSyntheticLeadSource,
  loadApiEnvironment,
  loadDatabaseEnvironment,
  loadWorkerEnvironment,
} from './index';

describe('environment configuration', () => {
  it('provides safe local defaults', () => {
    expect(loadApiEnvironment({})).toEqual({
      API_PORT: 3000,
      AUTO_FIRST_CONTACT: false,
      AUTOMATION_PAUSED: false,
      LEAD_PERSISTENCE: 'memory',
      LOG_LEVEL: 'info',
      NODE_ENV: 'local',
      OPERATOR_AUTH: 'disabled',
      OPERATOR_ROLE: 'operator',
      OPERATOR_TOKEN: '',
      PERSONAL_DATA_MODE: 'synthetic',
      PILOT_APPROVAL_ID: '',
      WEBHOOK_SECRET: '',
    });
  });

  it('coerces a valid API port', () => {
    expect(loadApiEnvironment({ API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('rejects an invalid API port', () => {
    expect(() => loadApiEnvironment({ API_PORT: '70000' })).toThrow();
  });

  it('loads a named worker without draining a database or bypassing the pause switch', () => {
    expect(loadWorkerEnvironment({ WORKER_NAME: 'follow-up' })).toMatchObject({
      AUTOMATION_PAUSED: false,
      OUTBOX_PERSISTENCE: 'memory',
      WORKER_NAME: 'follow-up',
    });
    expect(loadWorkerEnvironment({ AUTOMATION_PAUSED: 'true' }).AUTOMATION_PAUSED).toBe(true);
  });

  it('loads PostgreSQL configuration without exposing a default URL', () => {
    expect(
      loadDatabaseEnvironment({
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/ai_service_broker',
      }),
    ).toMatchObject({
      DATABASE_SSL: 'disable',
      DATABASE_URL: 'postgresql://app:secret@localhost:5432/ai_service_broker',
    });
    expect(() => loadDatabaseEnvironment({})).toThrow();
    expect(() => loadDatabaseEnvironment({ DATABASE_URL: 'mysql://localhost/database' })).toThrow();
  });

  it('recognizes only approved synthetic lead sources', () => {
    expect(isSyntheticLeadSource('synthetic')).toBe(true);
    expect(isSyntheticLeadSource('TEST')).toBe(true);
    expect(isSyntheticLeadSource('SAHIBINDEN')).toBe(false);
  });
});
