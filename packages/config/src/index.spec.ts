import { loadApiEnvironment, loadWorkerEnvironment } from './index';

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
});
