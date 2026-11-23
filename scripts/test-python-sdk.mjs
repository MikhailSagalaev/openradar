#!/usr/bin/env node
/**
 * Runs the Python SDK unit tests (sdk/python/tests) with whichever Python 3 is on PATH:
 * `python3` (Linux, macOS, CI) or `python` / `py -3` (Windows). Part of `pnpm verify`.
 * Fails with a clear message when no Python 3 is found.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [['python3'], ['python'], ['py', '-3']];

/** A candidate counts only if it runs and reports major version 3 (the Windows Store stub does not). */
function isPython3([cmd, ...pre]) {
  const probe = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.version_info[0])'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0 && probe.stdout.trim() === '3';
}

const python = candidates.find(isPython3);
if (!python) {
  console.error('Python SDK tests: no Python 3 found on PATH (tried python3, python, py -3). Install Python 3 to run `pnpm verify`.');
  process.exit(1);
}

const [cmd, ...pre] = python;
const run = spawnSync(cmd, [...pre, '-m', 'unittest', 'discover', '-s', 'sdk/python/tests'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
