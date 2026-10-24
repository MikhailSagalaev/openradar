#!/usr/bin/env node

/**
 * OpenRadar Extension Packaging Script
 * Creates a clean extension.zip for Chrome Web Store and Firefox Add-ons submission.
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = resolve(__dirname, '..');
const extDir = resolve(rootDir, 'extension');
const zipFile = resolve(rootDir, 'extension.zip');

if (existsSync(zipFile)) {
  rmSync(zipFile);
}

try {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${extDir}\\*' -DestinationPath '${zipFile}' -Force"`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`cd "${extDir}" && zip -r "${zipFile}" .`, {
      stdio: 'inherit',
    });
  }
  console.log(`Successfully packed extension into: ${zipFile}`);
} catch (err) {
  console.error('Failed to pack extension:', err.message);
  process.exit(1);
}
