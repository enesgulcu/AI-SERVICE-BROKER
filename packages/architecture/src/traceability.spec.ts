import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(__dirname, '../../..');

describe('requirement traceability', () => {
  it('maps every requirement id to an authority and, when implemented, to files', async () => {
    const markdown = await readFile(join(root, 'docs/TRACEABILITY.md'), 'utf8');
    const rows = markdown
      .split('\n')
      .filter((line) => line.startsWith('| REQ-'))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );

    expect(rows.length).toBeGreaterThanOrEqual(20);
    const ids = rows.map((row) => row[0]);
    expect(new Set(ids).size).toBe(ids.length);

    for (const [id, statement, authority, code, test, state] of rows) {
      expect(id).toMatch(/^REQ-\d{3}$/);
      expect(statement.length).toBeGreaterThan(10);
      expect(authority).toMatch(/^(OD-\d{3}|ADR-\d{4}|ROADMAP)$/);
      expect(['Built', 'Closed', 'Blocked']).toContain(state);
      if (state === 'Blocked') {
        expect(code).toBe('—');
        expect(test).toBe('—');
        continue;
      }
      await expect(access(join(root, code))).resolves.toBeUndefined();
      await expect(access(join(root, test))).resolves.toBeUndefined();
    }
  });
});
