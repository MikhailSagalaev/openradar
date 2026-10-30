#!/usr/bin/env node
// Writes .env from .env.example with fresh random secrets, so the Docker path starts
// without hand-editing: `pnpm init:env`, then `docker compose up -d`.
// An existing .env is never overwritten; pass --force to replace it.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = '.env';
if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(`${target} already exists; nothing changed. Run with --force to replace it.`);
  process.exit(1);
}

const secret = () => randomBytes(32).toString('hex');
const adminToken = secret();
const postgresPassword = secret();
const env = readFileSync('.env.example', 'utf8')
  .replaceAll('your_secure_random_admin_token_here_at_least_32_chars', adminToken)
  .replaceAll('your_secure_random_postgres_password_here', postgresPassword)
  .replace(/^# RADAR_WEB_KEY_SECRET=$/m, `RADAR_WEB_KEY_SECRET=${secret()}`);

writeFileSync(target, env, { mode: 0o600 });
console.log(`Wrote ${target} with a new admin token, PostgreSQL password and web key secret.`);
console.log('The admin token signs you in on the site: it is the RADAR_ADMIN_TOKEN line in .env.');
