#!/usr/bin/env node

/**
 * OpenRadar Extension Packaging Script
 * Creates a clean extension.zip (the contents of extension/ at the archive root) for the
 * /extension download, Chrome Web Store and Firefox Add-ons submission.
 *
 * Pure Node (zlib deflate + CRC-32), no `zip` binary or PowerShell: it runs the same on
 * Windows, macOS, CI and in the Docker build stage, which packs the zip at image build
 * time. Entries use forward slashes and a fixed timestamp, so the archive is reproducible.
 *
 * Usage: node scripts/pack-extension.js [output.zip]   (default: ./extension.zip)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = resolve(rootDir, 'extension');
const zipFile = resolve(process.argv[2] ?? resolve(rootDir, 'extension.zip'));

/** Every file under dir, sorted, as paths relative to dir with forward slashes. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// 1980-01-01 00:00 in MS-DOS format: a fixed date keeps the archive byte-for-byte stable.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const files = listFiles(extDir)
  .map((full) => ({ full, name: relative(extDir, full).split(sep).join('/') }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const locals = [];
const centrals = [];
let offset = 0;

for (const { full, name } of files) {
  const data = readFileSync(full);
  const deflated = deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length;
  const body = stored ? data : deflated;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(stored ? 0 : 8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);

  locals.push(local, nameBuf, body);
  centrals.push(central, nameBuf);
  offset += local.length + nameBuf.length + body.length;
}

const centralDir = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDir.length, 12);
end.writeUInt32LE(offset, 16);

try {
  writeFileSync(zipFile, Buffer.concat([...locals, centralDir, end]));
  console.log(`Successfully packed ${files.length} files into: ${zipFile}`);
} catch (err) {
  console.error('Failed to pack extension:', err.message);
  process.exit(1);
}
