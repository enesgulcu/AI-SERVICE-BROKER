import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = join(__dirname, '../../..');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.name === 'dist' || entry.name === 'node_modules') {
        return [];
      }
      return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
    }),
  );
  return files.flat();
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');
}

describe('module boundaries', () => {
  it('keeps domain packages free of framework, database, and application imports', async () => {
    const violations: string[] = [];
    for (const name of [
      'lead',
      'contact',
      'contracts',
      'config',
      'outbox',
      'customer',
      'conversation',
      'workflow',
      'messaging',
      'requirement',
      'safety',
    ]) {
      const files = await sourceFiles(join(root, 'packages', name, 'src'));
      for (const file of files) {
        const source = await readFile(file, 'utf8');
        for (const specifier of importsOf(source)) {
          if (
            specifier === 'pg' ||
            specifier.startsWith('@nestjs/') ||
            specifier === 'express' ||
            specifier.startsWith('@ai-service-broker/postgres') ||
            specifier.includes('/apps/')
          ) {
            violations.push(`${relative(root, file)} -> ${specifier}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('stops the lead package from depending on contact', async () => {
    const files = await sourceFiles(join(root, 'packages', 'lead', 'src'));
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (
        importsOf(source).some((specifier) => specifier.startsWith('@ai-service-broker/contact'))
      ) {
        violations.push(relative(root, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
