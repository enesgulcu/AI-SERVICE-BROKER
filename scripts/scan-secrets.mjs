import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execSync('git ls-files -z', { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file.length > 0);

const envFiles = tracked.filter(
  (file) => /(^|\/)\.env($|\.)/.test(file) && file !== '.env.example',
);
if (envFiles.length > 0) {
  console.error(`Tracked environment files: ${envFiles.join(', ')}`);
  process.exitCode = 1;
}

const secret = /npg_[A-Za-z0-9]+|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/;
const hits = [];
for (const file of tracked) {
  if (file === 'pnpm-lock.yaml' || file === '.env.example') {
    continue;
  }
  let text;
  try {
    text = readFileSync(file);
  } catch {
    continue;
  }
  if (text.includes(0)) {
    continue;
  }
  if (secret.test(text.toString('utf8'))) {
    hits.push(file);
  }
}

if (hits.length > 0) {
  console.error(`Possible secrets in tracked files: ${hits.join(', ')}`);
  process.exitCode = 1;
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.info(`Secret scan passed for ${tracked.length} tracked files.`);
