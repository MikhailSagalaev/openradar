import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConnector } from '../src/cli/generator.ts';

describe('CLI new-connector generator', () => {
  it('rejects invalid connector names', () => {
    expect(() => generateConnector('Bad Name!')).toThrow(/Invalid connector name/);
    expect(() => generateConnector('---')).toThrow(/Invalid connector name/);
  });

  it('generates a valid JSON connector scaffolding in target root', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'radar-conn-'));
    try {
      const result = generateConnector('sample-api', { format: 'json', rootDir: tmp });

      const adapterFile = resolve(tmp, result.adapterPath);
      const fixtureFile = resolve(tmp, result.fixturePath);
      const testFile = resolve(tmp, result.testPath);

      expect(existsSync(adapterFile)).toBe(true);
      expect(existsSync(fixtureFile)).toBe(true);
      expect(existsSync(testFile)).toBe(true);

      const adapterCode = readFileSync(adapterFile, 'utf8');
      expect(adapterCode).toContain("kind: 'sample-api'");
      expect(adapterCode).toContain('export const sampleApiSource: SourceAdapter');
      expect(adapterCode).not.toContain('sanitizePrivacy');

      const fixtureContent = JSON.parse(readFileSync(fixtureFile, 'utf8'));
      expect(Array.isArray(fixtureContent.items)).toBe(true);
      expect(fixtureContent.items.length).toBeGreaterThan(0);

      const testCode = readFileSync(testFile, 'utf8');
      expect(testCode).toContain("describe('sample-api source adapter'");
      expect(testCode).toContain('sampleApiSource.poll!(');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('generates a valid HTML connector scaffolding in target root', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'radar-conn-'));
    try {
      const result = generateConnector('freelance-board', { format: 'html', rootDir: tmp });

      const adapterFile = resolve(tmp, result.adapterPath);
      const fixtureFile = resolve(tmp, result.fixturePath);
      const testFile = resolve(tmp, result.testPath);

      expect(existsSync(adapterFile)).toBe(true);
      expect(existsSync(fixtureFile)).toBe(true);
      expect(existsSync(testFile)).toBe(true);

      const adapterCode = readFileSync(adapterFile, 'utf8');
      expect(adapterCode).toContain("kind: 'freelance-board'");
      expect(adapterCode).toContain('cheerio');
      expect(adapterCode).toContain('export const freelanceBoardSource: SourceAdapter');

      const fixtureContent = readFileSync(fixtureFile, 'utf8');
      expect(fixtureContent).toContain('vacancy-item');

      const testCode = readFileSync(testFile, 'utf8');
      expect(testCode).toContain('freelanceBoardSource');
      expect(testCode).toContain('freelance-board.html');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('protects against overwriting existing files unless force is specified', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'radar-conn-'));
    try {
      generateConnector('sample-board', { format: 'json', rootDir: tmp });
      expect(() =>
        generateConnector('sample-board', { format: 'json', rootDir: tmp, force: false }),
      ).toThrow(/Files already exist/);

      expect(() =>
        generateConnector('sample-board', { format: 'json', rootDir: tmp, force: true }),
      ).not.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
