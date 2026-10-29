#!/usr/bin/env node

/**
 * Fails when the release version differs between package.json, src/version.ts and server.json.
 * Runs in CI before the tests; locally: `node scripts/check-version.js`.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(rootDir, path), 'utf8');

const versionTs = read('src/version.ts').match(/export const VERSION\s*=\s*['"]([^'"]+)['"]/);
const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'src/version.ts': versionTs?.[1],
  'server.json': JSON.parse(read('server.json')).version,
};

const distinct = new Set(Object.values(versions));
if (distinct.size !== 1 || distinct.has(undefined)) {
  console.error('Version mismatch: package.json, src/version.ts and server.json must carry the same version.');
  for (const [file, version] of Object.entries(versions)) console.error(`  ${file}: ${version ?? '(not found)'}`);
  process.exit(1);
}

console.log(`Version ${versions['package.json']} matches in package.json, src/version.ts and server.json.`);
