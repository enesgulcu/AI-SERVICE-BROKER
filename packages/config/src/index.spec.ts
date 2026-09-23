import { loadApiEnvironment, loadDatabaseEnvironment, loadWorkerEnvironment } from './index';

describe('environment configuration', () => {
  it('provides safe local defaults', () => {
    expect(loadApiEnvironment({})).toEqual({
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      NODE_ENV: 'local',
    });
  });

  it('coerces a valid API port', () => {
    expect(loadApiEnvironment({ API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('rejects an invalid API port', () => {
    expect(() => loadApiEnvironment({ API_PORT: '70000' })).toThrow();
  });

  it('loads a named worker', () => {
    expect(loadWorkerEnvironment({ WORKER_NAME: 'follow-up' }).WORKER_NAME).toBe('follow-up');
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
});
