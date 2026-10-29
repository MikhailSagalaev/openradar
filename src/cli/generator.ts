import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export interface GenerateConnectorOptions {
  format?: 'json' | 'html';
  force?: boolean;
  rootDir?: string;
}

export interface GenerateConnectorResult {
  name: string;
  adapterPath: string;
  fixturePath: string;
  testPath: string;
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function generateConnector(
  rawName: string,
  options: GenerateConnectorOptions = {},
): GenerateConnectorResult {
  const cleanName = rawName.trim().toLowerCase();
  if (!cleanName || !/^[a-z0-9][a-z0-9_-]*$/.test(cleanName)) {
    throw new Error(
      `Invalid connector name "${rawName}". Name must start with an alphanumeric character and contain only lowercase letters, numbers, hyphens, and underscores (e.g. "habr", "greenhouse", "fl-job").`,
    );
  }

  const format = options.format === 'html' ? 'html' : 'json';
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();

  const adapterDir = resolve(rootDir, 'src/sources');
  const fixtureDir = resolve(rootDir, 'test/fixtures');
  const testDir = resolve(rootDir, 'test/sources');

  const adapterFile = resolve(adapterDir, `${cleanName}.ts`);
  const fixtureFile = resolve(fixtureDir, `${cleanName}.${format}`);
  const testFile = resolve(testDir, `${cleanName}.test.ts`);

  if (!options.force) {
    const existing = [adapterFile, fixtureFile, testFile].filter((p) => existsSync(p));
    if (existing.length > 0) {
      const relPaths = existing.map((p) => relative(rootDir, p));
      throw new Error(
        `Files already exist:\n  ${relPaths.join('\n  ')}\nUse --force to overwrite.`,
      );
    }
  }

  mkdirSync(adapterDir, { recursive: true });
  mkdirSync(fixtureDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });

  const camelName = toCamelCase(cleanName);
  const pascalName = toPascalCase(cleanName);

  let adapterContent: string;
  let fixtureContent: string;
  let testContent: string;

  if (format === 'json') {
    adapterContent = `import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';

export const ${camelName}Source: SourceAdapter = {
  kind: '${cleanName}',
  access: 'public',
  description: '${pascalName} connector for openradar',
  risks: [
    'Markup or API structure may change without notice',
    'Rate limiting may apply to automated requests',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const url =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://example.com/api/vacancies';

    const raw = await fetchText(ctx, url, { Accept: 'application/json' });
    let data: {
      items?: Array<{
        id?: string | number;
        title?: string;
        description?: string;
        price?: number;
        city?: string;
        url?: string;
      }>;
    };

    try {
      data = JSON.parse(raw);
    } catch (err) {
      ctx.logger.warn('${pascalName}: Failed to parse JSON response', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 20), 100));
    const leads: RawLead[] = [];

    for (const item of items.slice(0, limit)) {
      if (!item.id || !item.title) continue;
      const title = String(item.title).trim();
      const rawText = item.description ? \`\${title}\\n\\n\${item.description}\` : title;
      const text = rawText;

      leads.push({
        sourceId: source.id,
        externalId: \`${cleanName}:\${item.id}\`,
        url: item.url ?? \`\${url}/\${item.id}\`,
        title,
        text,
        city: item.city,
        budget: typeof item.price === 'number' ? item.price : undefined,
      });
    }

    return leads;
  },
};
`;

    fixtureContent = `{
  "items": [
    {
      "id": "item-101",
      "title": "Разработчик TypeScript / Node.js",
      "description": "Разработка распределенных микросервисов и API интеграций",
      "price": 180000,
      "city": "Москва",
      "url": "https://example.com/vacancies/item-101"
    },
    {
      "id": "item-102",
      "title": "Инженер данных / ETL",
      "description": "Построение витрин данных в PostgreSQL и ClickHouse",
      "price": 220000,
      "city": "Санкт-Петербург",
      "url": "https://example.com/vacancies/item-102"
    }
  ]
}
`;

    testContent = `import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeSource, pollContext } from '../helpers.ts';
import { ${camelName}Source } from '../../src/sources/${cleanName}.ts';

function fixture(filename: string): string {
  return readFileSync(new URL(\`../fixtures/\${filename}\`, import.meta.url), 'utf8');
}

describe('${cleanName} source adapter', () => {
  it('parses ${cleanName} fixture correctly', async () => {
    const leads = await ${camelName}Source.poll!(
      makeSource({ kind: '${cleanName}', config: { url: 'https://example.com/api/vacancies' } }),
      pollContext(fixture('${cleanName}.json')),
    );

    expect(leads.length).toBeGreaterThan(0);
    const first = leads[0]!;
    expect(first.title).toContain('Разработчик');
    expect(first.externalId).toBe('${cleanName}:item-101');
    expect(first.url).toBeDefined();
    expect(first.budget).toBe(180000);
  });
});
`;
  } else {
    adapterContent = `import * as cheerio from 'cheerio';
import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';

export const ${camelName}Source: SourceAdapter = {
  kind: '${cleanName}',
  access: 'public',
  description: '${pascalName} connector for openradar',
  risks: [
    'HTML markup may change without notice',
    'Rate limiting may apply to automated requests',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const url =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://example.com/vacancies';

    const html = await fetchText(ctx, url);
    const $ = cheerio.load(html);
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 20), 100));
    const leads: RawLead[] = [];

    $('.job-card, .vacancy-item').slice(0, limit).each((index, el) => {
      const $el = $(el);
      const id = $el.attr('data-id') || String(index + 1);
      const title = $el.find('.title, h2, h3').first().text().trim();
      const description = $el.find('.description, p').first().text().trim();
      const link = $el.find('a').first().attr('href');
      const itemUrl = link ? new URL(link, url).toString() : undefined;

      if (!title) return;
      const rawText = description ? \`\${title}\\n\\n\${description}\` : title;

      leads.push({
        sourceId: source.id,
        externalId: \`${cleanName}:\${id}\`,
        url: itemUrl,
        title,
        text: rawText,
      });
    });

    return leads;
  },
};
`;

    fixtureContent = `<!DOCTYPE html>
<html>
<head><title>${pascalName} Vacancies</title></head>
<body>
  <div class="vacancy-item" data-id="item-101">
    <h2 class="title">Разработчик TypeScript / Node.js</h2>
    <p class="description">Разработка распределенных микросервисов и API интеграций</p>
    <a href="/vacancies/item-101">Подробнее</a>
  </div>
  <div class="vacancy-item" data-id="item-102">
    <h2 class="title">Инженер данных / ETL</h2>
    <p class="description">Построение витрин данных в PostgreSQL и ClickHouse</p>
    <a href="/vacancies/item-102">Подробнее</a>
  </div>
</body>
</html>
`;

    testContent = `import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeSource, pollContext } from '../helpers.ts';
import { ${camelName}Source } from '../../src/sources/${cleanName}.ts';

function fixture(filename: string): string {
  return readFileSync(new URL(\`../fixtures/\${filename}\`, import.meta.url), 'utf8');
}

describe('${cleanName} source adapter', () => {
  it('parses ${cleanName} fixture correctly', async () => {
    const leads = await ${camelName}Source.poll!(
      makeSource({ kind: '${cleanName}', config: { url: 'https://example.com/vacancies' } }),
      pollContext(fixture('${cleanName}.html')),
    );

    expect(leads.length).toBeGreaterThan(0);
    const first = leads[0]!;
    expect(first.title).toContain('Разработчик');
    expect(first.externalId).toBe('${cleanName}:item-101');
    expect(first.url).toBeDefined();
  });
});
`;
  }

  writeFileSync(adapterFile, adapterContent, 'utf8');
  writeFileSync(fixtureFile, fixtureContent, 'utf8');
  writeFileSync(testFile, testContent, 'utf8');

  return {
    name: cleanName,
    adapterPath: relative(rootDir, adapterFile),
    fixturePath: relative(rootDir, fixtureFile),
    testPath: relative(rootDir, testFile),
  };
}
