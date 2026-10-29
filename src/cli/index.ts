import { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Lead, LeadStatus, SourceConfig, SourceKind, SourceRecord } from '../core/types.ts';
import { pollAll, pollSource, type PollDeps, type PollSummary } from '../pipeline/poll.ts';
import { rescoreLeads } from '../pipeline/rescore.ts';
import { PollRunner } from '../pipeline/runner.ts';
import { createRuntime, type Runtime } from '../runtime.ts';
import { createApp } from '../server/app.ts';
import { startServer } from '../server/index.ts';
import { SOURCE_PRESETS } from '../sources/presets.ts';
import { loadEnv } from '../config.ts';
import { runMigrations } from '../store/migrator.ts';
import { VERSION } from '../version.ts';
import { generateConnector } from './generator.ts';

const SOURCE_KINDS: SourceKind[] = ['rss', 'telegram', 'telegram-account', 'kwork', 'webhook', 'imap', 'trudvsem'];

interface AddSourceOptions {
  share?: boolean;
  kind: string;
  title: string;
  url?: string;
  channel?: string;
  chat: string[];
  sessionEnv?: string;
  city?: string;
  category?: string;
  include: string[];
  exclude: string[];
  minBudget?: string;
  maxAge?: string;
  limit?: string;
  trust?: string;
  token?: string;
  disabled?: boolean;

  host?: string;
  port?: string;
  user?: string;
  passwordEnv?: string;
  mailbox?: string;
  sinceDays?: string;
  subject: string[];
  from: string[];
  markSeen?: boolean;
  secure?: boolean;
}

interface ServeOptions {
  port?: string;
  noScheduler?: boolean;
}

interface RunOptions {
  interval?: string;
  once?: boolean;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

function numberOption(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const headerLine = headers.map((header, index) => header.padEnd(widths[index] ?? 0)).join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');
  const body = rows
    .map((row) => row.map((cell, index) => (cell ?? '').padEnd(widths[index] ?? 0)).join('  '))
    .join('\n');
  return [headerLine, divider, body].filter(Boolean).join('\n');
}

function pollDeps(runtime: Runtime): PollDeps {
  return {
    store: runtime.store,
    sinks: runtime.sinks,
    classifier: runtime.classifier,
    logger: runtime.logger,
    env: runtime.env,
    fetchImpl: runtime.fetchImpl,
    similar: runtime.similar,
    sources: runtime.sources,
  };
}

function printSummaries(summaries: PollSummary[]): void {
  if (!summaries.length) {
    console.log('Нет включённых источников для опроса.');
    return;
  }
  const rows = summaries.map((summary) => [
    summary.sourceTitle,
    String(summary.found),
    String(summary.inserted),
    String(summary.duplicates),
    String(summary.rejected),
    String(summary.delivered),
    String(summary.failed),
    `${summary.durationMs}ms`,
    summary.error ?? '',
  ]);
  console.log(
    table(
      ['Источник', 'Найдено', 'Новых', 'Дубли', 'Отклонено', 'Доставлено', 'Ошибок', 'Время', 'Ошибка'],
      rows,
    ),
  );
}

function printLeads(leads: Lead[]): void {
  if (!leads.length) {
    console.log('Лидов нет.');
    return;
  }
  const rows = leads.map((lead) => [
    lead.id.slice(0, 8),
    String(lead.score),
    lead.status,
    lead.city ?? '—',
    typeof lead.budget === 'number' ? String(lead.budget) : '—',
    lead.title.slice(0, 60),
    lead.url ?? '',
  ]);
  console.log(table(['ID', 'Скор', 'Статус', 'Город', 'Бюджет', 'Заголовок', 'URL'], rows));
}

function configSummary(source: SourceRecord): string {
  const value =
    source.config.channel ??
    source.config.url ??
    (source.config.categoryId ? `category ${source.config.categoryId}` : undefined);
  return value ? String(value) : '—';
}

async function withRuntime<T>(fn: (runtime: Runtime) => Promise<T> | T): Promise<T> {
  const runtime = await createRuntime();
  try {
    return await fn(runtime);
  } finally {
    await runtime.store.close();
  }
}

async function sleep(ms: number, stopped: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopped()) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(500, end - Date.now())));
  }
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name('radar')
    .description('Self-hosted lead pipeline for public order sources')
    .version(VERSION);

  program
    .command('migrate')
    .description('Apply database migrations in PostgreSQL')
    .action(async () => {
      const env = loadEnv();
      if (!env.DATABASE_URL) {
        fail('DATABASE_URL is not configured in .env');
      }
      console.log('Выполняем миграции базы данных...');
      try {
        const result = await runMigrations(env.DATABASE_URL);
        if (result.applied.length === 0) {
          console.log('Схема базы данных уже актуальна (миграций нет).');
        } else {
          console.log(`Успешно применены миграции: ${result.applied.join(', ')}`);
        }
      } catch (err) {
        fail(`Ошибка миграции: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  program
    .command('init')
    .description('Initialize database and show next steps')
    .action(async () => {
      const env = loadEnv();
      if (env.DATABASE_URL) {
        try {
          await runMigrations(env.DATABASE_URL);
        } catch (err) {
          fail(`Ошибка миграции: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      console.log('База данных готова.');
      console.log('Дальше:');
      console.log('  radar source presets --add   # загрузить популярные биржи (FL.ru, Хабр, Kwork, Telegram)');
      console.log('  radar poll');
      console.log('  radar serve');
    });

  const source = program.command('source').description('Manage sources');

  source
    .command('add')
    .description('Add a source')
    .requiredOption('--kind <kind>', `One of: ${SOURCE_KINDS.join(', ')}`)
    .requiredOption('--title <title>', 'Human-readable title')
    .option('--url <url>', 'Feed URL or page URL')
    .option('--channel <channel>', 'Telegram channel username (without @)')
    .option('--chat <chat>', 'telegram-account: channel or chat (@name, t.me link or id); repeatable', collect, [])
    .option('--session-env <name>', 'telegram-account: variable with the session (RADAR_TELEGRAM_SESSION by default)')
    .option('--city <city>', 'Default city')
    .option('--category <id>', 'Source category id (Kwork)')
    .option('--include <word>', 'Required keyword; repeatable', collect, [])
    .option('--exclude <word>', 'Excluded keyword; repeatable', collect, [])
    .option('--min-budget <rubles>', 'Reject leads below this budget')
    .option('--max-age <hours>', 'Reject leads older than this')
    .option('--limit <n>', 'Max items per poll')
    .option('--trust <0-10>', 'Source trust bonus for scoring')
    .option('--token <token>', 'Per-source token for webhook ingestion')
    .option('--disabled', 'Create the source disabled')
    .option('--share', 'Send leads of this source to the hub (RADAR_HUB_URL, RADAR_NODE_KEY)')
    .option('--host <host>', 'IMAP host')
    .option('--port <port>', 'IMAP port (993 by default)')
    .option('--user <user>', 'IMAP user')
    .option('--password-env <name>', 'Environment variable with the IMAP password')
    .option('--mailbox <name>', 'IMAP mailbox', 'INBOX')
    .option('--since-days <n>', 'How many days of mail to scan', '7')
    .option('--subject <text>', 'Only emails whose subject contains this; repeatable', collect, [])
    .option('--from <text>', 'Only emails whose sender contains this; repeatable', collect, [])
    .option('--mark-seen', 'Mark processed emails as seen')
    .option('--no-secure', 'Use plain IMAP (usually port 143)')
    .action(async (options: AddSourceOptions) => {
      const kind = options.kind as SourceKind;
      if (!SOURCE_KINDS.includes(kind)) {
        fail(`unknown kind "${options.kind}"; use one of ${SOURCE_KINDS.join(', ')}`);
      }

      const config: SourceConfig = {};
      if (options.url) config.url = options.url;
      if (options.channel) config.channel = options.channel;
      if (options.city) config.city = options.city;
      if (options.category) config.categoryId = options.category;
      if (options.include.length) config.includeKeywords = options.include;
      if (options.exclude.length) config.excludeKeywords = options.exclude;

      const minBudget = numberOption(options.minBudget);
      if (minBudget !== undefined) config.minBudget = minBudget;
      const maxAge = numberOption(options.maxAge);
      if (maxAge !== undefined) config.maxAgeHours = maxAge;
      const limit = numberOption(options.limit);
      if (limit !== undefined) config.limit = limit;
      const trust = numberOption(options.trust);
      if (trust !== undefined) config.trust = trust;

      if (options.token) config.token = options.token;
      if (options.share) config.share = true;
      if (kind === 'imap') {
        if (options.host) config.host = options.host;
        const port = numberOption(options.port);
        if (port !== undefined) config.port = port;
        if (options.user) config.user = options.user;
        if (options.passwordEnv) config.passwordEnv = options.passwordEnv;
        if (options.mailbox) config.mailbox = options.mailbox;
        const sinceDays = numberOption(options.sinceDays);
        if (sinceDays !== undefined) config.sinceDays = sinceDays;
        if (options.subject.length) config.subjectIncludes = options.subject;
        if (options.from.length) config.fromIncludes = options.from;
        if (options.markSeen) config.markSeen = true;
        if (options.secure === false) config.secure = false;
      }

      if (kind === 'telegram-account') {
        if (!options.chat.length) fail('telegram-account source requires --chat');
        config.chats = options.chat;
        if (options.sessionEnv) config.sessionEnv = options.sessionEnv;
      }

      if (kind === 'rss' && !config.url) fail('rss source requires --url');
      if (kind === 'telegram' && !config.channel && !config.url) {
        fail('telegram source requires --channel or --url');
      }
      if (kind === 'trudvsem' && !config.url) {
        config.url = 'https://opendata.trudvsem.ru/api/v1/vacancies';
      }
      if (kind === 'imap' && (!config.host || !config.user || !config.passwordEnv)) {
        fail('imap source requires --host, --user and --password-env');
      }
      if (kind === 'webhook' && !config.token) {
        config.token = randomBytes(16).toString('hex');
      }

      await withRuntime(async (runtime) => {
        const created = await runtime.store.createSource({
          kind,
          title: options.title,
          config,
          enabled: !options.disabled,
        });
        console.log(`Создан источник ${created.id} (${created.kind})`);
        console.log(`  ${created.title}`);
        if (created.kind === 'webhook' && created.config.token) {
          console.log(`  Токен источника: ${created.config.token}`);
          console.log('  Сохраните его: он больше не будет показан.');
        }
      });
    });

  source
    .command('list')
    .description('List sources')
    .action(async () => {
      await withRuntime(async (runtime) => {
        const sources = await runtime.store.listSources();
        if (!sources.length) {
          console.log('Источников нет. Добавьте: radar source add ...');
          return;
        }
        const rows = sources.map((item) => [
          item.id,
          item.kind,
          item.enabled ? 'on' : 'off',
          item.title,
          configSummary(item),
        ]);
        console.log(table(['ID', 'Тип', 'Статус', 'Название', 'Конфигурация'], rows));
      });
    });

  source
    .command('share <id> [state]')
    .description('Share leads of a source with the hub: on (default) or off')
    .action(async (id: string, state = 'on') => {
      if (state !== 'on' && state !== 'off') fail('state must be on or off');
      await withRuntime(async (runtime) => {
        const current = await runtime.store.getSource(id);
        if (!current) fail(`source ${id} not found`);
        await runtime.store.updateSource(id, { config: { ...current!.config, share: state === 'on' } });
        console.log(state === 'on' ? `Источник ${id} отправляется в хаб` : `Источник ${id} больше не отправляется в хаб`);
        if (state === 'on' && (!runtime.env.RADAR_HUB_URL || !runtime.env.RADAR_NODE_KEY)) {
          console.log('Задайте RADAR_HUB_URL и RADAR_NODE_KEY (radar key), иначе отправки не будет.');
        }
      });
    });

  source
    .command('enable <id>')
    .description('Enable a source')
    .action(async (id: string) => {
      await withRuntime(async (runtime) => {
        const updated = await runtime.store.updateSource(id, { enabled: true });
        if (!updated) fail(`source ${id} not found`);
        console.log(`Источник ${id} включён`);
      });
    });

  source
    .command('disable <id>')
    .description('Disable a source')
    .action(async (id: string) => {
      await withRuntime(async (runtime) => {
        const updated = await runtime.store.updateSource(id, { enabled: false });
        if (!updated) fail(`source ${id} not found`);
        console.log(`Источник ${id} выключен`);
      });
    });

  source
    .command('remove <id>')
    .description('Delete a source')
    .action(async (id: string) => {
      await withRuntime(async (runtime) => {
        const deleted = await runtime.store.deleteSource(id);
        if (!deleted) fail(`source ${id} not found`);
        console.log(`Источник ${id} удалён`);
      });
    });

  source
    .command('presets')
    .description('List or add pre-configured freelance and order sources')
    .option('--add', 'Add all preset sources into the database')
    .action(async (options: { add?: boolean }) => {
      await withRuntime(async (runtime) => {
        if (!options.add) {
          console.log('Доступные предустановленные источники:');
          const rows = SOURCE_PRESETS.map((p) => [p.id, p.kind, p.title, p.description]);
          console.log(table(['ID', 'Тип', 'Название', 'Описание'], rows));
          console.log('\nЧтобы добавить их в базу, выполните: radar source presets --add');
          return;
        }
        const existing = await runtime.store.listSources();
        let added = 0;
        for (const preset of SOURCE_PRESETS) {
          const already = existing.some(
            (s) =>
              s.title === preset.title ||
              (preset.config.url && s.config.url === preset.config.url) ||
              (preset.config.channel && s.config.channel === preset.config.channel),
          );
          if (already) continue;
          await runtime.store.createSource({
            kind: preset.kind,
            title: preset.title,
            config: preset.config,
            enabled: true,
          });
          added++;
          console.log(`Добавлен: ${preset.title} (${preset.kind})`);
        }
        console.log(`\nГотово: добавлено источников: ${added}.`);
      });
    });

  program
    .command('poll [sourceId]')
    .description('Poll one source or all enabled sources once')
    .action(async (sourceId?: string) => {
      await withRuntime(async (runtime) => {
        const deps = pollDeps(runtime);
        if (sourceId) {
          const item = await runtime.store.getSource(sourceId);
          if (!item) fail(`source ${sourceId} not found`);
          const summary = await pollSource(item, deps);
          printSummaries([summary]);
          if (summary.error) process.exitCode = 1;
          return;
        }
        const summaries = await pollAll(deps);
        printSummaries(summaries);
        if (summaries.some((summary) => summary.error)) process.exitCode = 1;
      });
    });

  program
    .command('leads')
    .description('List stored leads')
    .option('--limit <n>', 'Number of leads', '20')
    .option('--status <status>', 'new | delivered | rejected | failed')
    .option('--source <id>', 'Filter by source id')
    .option('--json', 'Print JSON')
    .action(async (options: { limit: string; status?: string; source?: string; json?: boolean }) => {
      await withRuntime(async (runtime) => {
        const leads = await runtime.store.listLeads({
          limit: Number(options.limit) || 20,
          status: options.status as LeadStatus | undefined,
          sourceId: options.source,
        });
        if (options.json) console.log(JSON.stringify(leads, null, 2));
        else printLeads(leads);
      });
    });

  program
    .command('stats')
    .description('Print counters')
    .action(async () => {
      await withRuntime(async (runtime) => {
        console.log(JSON.stringify(await runtime.store.getStats(), null, 2));
      });
    });

  program
    .command('rescore')
    .description('Recompute lead scores with the current formula (votes are kept)')
    .option('--limit <n>', 'Newest leads to rescore', '5000')
    .action(async (options: { limit: string }) => {
      await withRuntime(async (runtime) => {
        const summary = await rescoreLeads(runtime.store, { limit: Number(options.limit) || 5000 });
        console.log(`Пересчитано: ${summary.checked}, изменилось: ${summary.changed}`);
      });
    });

  program
    .command('runs')
    .description('Show recent poll runs')
    .option('--limit <n>', 'Number of runs', '20')
    .action(async (options: { limit: string }) => {
      await withRuntime(async (runtime) => {
        const runs = await runtime.store.listRuns(Number(options.limit) || 20);
        const rows = runs.map((run) => [
          run.sourceId,
          String(run.found),
          String(run.inserted),
          String(run.duplicates),
          String(run.rejected),
          String(run.delivered),
          run.startedAt,
          run.error ?? '',
        ]);
        console.log(
          table(
            ['Источник', 'Найдено', 'Новых', 'Дубли', 'Отклонено', 'Доставлено', 'Когда', 'Ошибка'],
            rows,
          ),
        );
      });
    });

  program
    .command('run')
    .description('Poll sources continuously')
    .option('--interval <seconds>', 'Seconds between polls')
    .option('--once', 'Poll once and exit')
    .action(async (options: RunOptions) => {
      await withRuntime(async (runtime) => {
        const interval = numberOption(options.interval) ?? runtime.env.RADAR_POLL_INTERVAL_SEC;
        let stopping = false;
        const stop = (): void => {
          stopping = true;
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);

        do {
          const summaries = await pollAll(pollDeps(runtime));
          printSummaries(summaries);
          if (options.once) break;
          await sleep(interval * 1000, () => stopping);
        } while (!stopping);
      });
    });

  program
    .command('serve')
    .description('Start the HTTP API and dashboard')
    .option('--port <port>', 'HTTP port')
    .option('--no-scheduler', 'Do not poll sources in the background')
    .action(async (options: ServeOptions) => {
      const runtime = await createRuntime();
      if (!runtime.env.RADAR_ADMIN_TOKEN) {
        // Without a token nobody can sign in to manage sources: issue one for this run.
        runtime.env.RADAR_ADMIN_TOKEN = randomBytes(24).toString('hex');
        console.error(
          `RADAR_ADMIN_TOKEN не задан, токен администратора на этот запуск: ${runtime.env.RADAR_ADMIN_TOKEN}\n` +
            'Задайте RADAR_ADMIN_TOKEN в .env, чтобы он не менялся между запусками.',
        );
      }
      const app = createApp(runtime);
      const port = numberOption(options.port) ?? runtime.env.PORT;
      const server = startServer(app, port, runtime.env.RADAR_BIND);
      const runner = options.noScheduler
        ? undefined
        : new PollRunner(pollDeps(runtime), runtime.env.RADAR_POLL_INTERVAL_SEC, runtime.logger);
      runner?.start();

      const shutdown = (): void => {
        runner?.stop();
        server.close(async () => {
          try {
            await runtime.store.close();
          } finally {
            process.exit(0);
          }
        });
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

  program
    .command('export')
    .description('Export leads to JSON or CSV')
    .option('--format <format>', 'json or csv', 'json')
    .option('--out <path>', 'Output file')
    .option('--limit <n>', 'Max leads', '5000')
    .action(async (options: { format: string; out?: string; limit: string }) => {
      const format = options.format.toLowerCase();
      if (format !== 'json' && format !== 'csv') fail('format must be json or csv');
      const out = options.out ?? (format === 'csv' ? 'radar-export.csv' : 'radar-export.json');

      await withRuntime(async (runtime) => {
        const leads = await runtime.store.listLeads({ limit: Number(options.limit) || 5000 });
        if (format === 'json') {
          writeFileSync(resolve(out), JSON.stringify(leads, null, 2), 'utf8');
        } else {
          const header = ['id', 'createdAt', 'status', 'score', 'title', 'url', 'city', 'budget', 'sourceId'];
          // Leading = + - @ (and tab/CR) would make spreadsheets evaluate the cell as a formula.
          const cell = (value: unknown): string => {
            const text = String(value ?? '');
            const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
            return `"${safe.replace(/"/g, '""')}"`;
          };
          const lines = [
            header.join(','),
            ...leads.map((lead) =>
              [
                lead.id,
                lead.createdAt,
                lead.status,
                lead.score,
                lead.title,
                lead.url,
                lead.city,
                lead.budget,
                lead.sourceId,
              ]
                .map(cell)
                .join(','),
            ),
          ];
          writeFileSync(resolve(out), lines.join('\n'), 'utf8');
        }
        console.log(`Экспортировано ${leads.length} лидов в ${resolve(out)}`);
      });
    });

  program
    .command('new-connector <name>')
    .description('Generate scaffolding for a new community source adapter')
    .option('--format <format>', 'Payload format: json or html', 'json')
    .option('--force', 'Overwrite existing files if present', false)
    .action((name: string, options: { format?: string; force?: boolean }) => {
      try {
        const result = generateConnector(name, {
          format: options.format === 'html' ? 'html' : 'json',
          force: options.force,
        });
        console.log(`✓ Создан адаптер: ${result.adapterPath}`);
        console.log(`✓ Создана фикстура: ${result.fixturePath}`);
        console.log(`✓ Создан тест: ${result.testPath}`);
        console.log('\nСледующие шаги:');
        console.log(`  1. Настройте парсер в ${result.adapterPath}`);
        console.log(`  2. Добавьте реальный ответ в ${result.fixturePath}`);
        console.log(`  3. Запустите тесты: pnpm test ${result.testPath}`);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  program
    .command('push')
    .description('Read radar/2 observations as NDJSON from stdin and ingest them (docs/PROTOCOL.md)')
    .requiredOption('--source <id>', 'source id (a webhook source)')
    .option('--url <url>', 'send to a remote node or hub instead of the local store')
    .option('--token <token>', 'source token for --url (or RADAR_PUSH_TOKEN)')
    .action(async (options: { source: string; url?: string; token?: string }) => {
      const { pushLocal, pushRemote } = await import('./push.ts');
      let summary;
      if (options.url) {
        const token = options.token ?? process.env.RADAR_PUSH_TOKEN;
        if (!token) fail('--url requires --token or RADAR_PUSH_TOKEN');
        summary = await pushRemote(process.stdin, { url: options.url, sourceId: options.source, token });
      } else {
        summary = await withRuntime(async (runtime) => {
          const source = await runtime.store.getSource(options.source);
          if (!source) fail(`source not found: ${options.source}`);
          return pushLocal(process.stdin, source, pollDeps(runtime));
        });
      }
      console.log(
        `received ${summary.received}, accepted ${summary.accepted}, duplicate ${summary.duplicate}, rejected ${summary.rejected}`,
      );
      for (const error of summary.errors) console.error(error);
    });

  program
    .command('key')
    .description('Generate a participant key for the hub (RADAR_NODE_KEY), or show the public key of one')
    .option('--show <key>', 'hex or nsec private key to show the public key of')
    .action(async (options: { show?: string }) => {
      const { generateKeyPair, importPrivateKey } = await import('../net/keys.ts');
      const pair = options.show ? importPrivateKey(options.show) : generateKeyPair();
      console.log(`pubkey  ${pair.pubKey}`);
      console.log(`npub    ${pair.npub}`);
      if (!options.show) {
        console.log(`nsec    ${pair.nsec}`);
        console.log('Keep the nsec secret: put it in RADAR_NODE_KEY. Your rating is bound to this key.');
      }
    });

  const telegram = program.command('telegram').description('Read Telegram through your own account');

  telegram
    .command('login')
    .description('Sign in once and print the session for RADAR_TELEGRAM_SESSION')
    .action(async () => {
      const { newTelegramClient } = await import('../sources/telegram-account.ts');
      const client = await newTelegramClient();
      const self = await client.start({
        phone: () => client.input('Phone (+7...): '),
        code: () => client.input('Code from Telegram: '),
        password: () => client.input('Two-step password: '),
      });
      const session = await client.exportSession();
      console.log(`\nSigned in as ${self.displayName}${self.username ? ` (@${self.username})` : ''}.`);
      console.log('Put this line into .env (it grants full access to the account, keep it secret):\n');
      console.log(`RADAR_TELEGRAM_SESSION=${session}\n`);
      console.log('A second account: RADAR_TELEGRAM_SESSION_<NAME>, and that name in the source settings.');
      await client.destroy();
    });

  telegram
    .command('chats')
    .description('List the channels and chats of the account, to pick sources from')
    .option('--session-env <name>', 'variable with the session', 'RADAR_TELEGRAM_SESSION')
    .action(async (options: { sessionEnv: string }) => {
      const { newTelegramClient, TELEGRAM_SESSION_ENV_RE } = await import('../sources/telegram-account.ts');
      if (!TELEGRAM_SESSION_ENV_RE.test(options.sessionEnv)) throw new Error('--session-env must be RADAR_TELEGRAM_SESSION[_NAME]');
      const session = process.env[options.sessionEnv]?.trim();
      if (!session) throw new Error(`${options.sessionEnv} is empty: run "radar telegram login" first`);
      const client = await newTelegramClient();
      await client.importSession(session);
      await client.connect();
      for await (const dialog of client.iterDialogs({ limit: 500 })) {
        const peer = dialog.peer;
        if (peer.type === 'user') continue;
        const name = peer.username ? `@${peer.username}` : String(peer.id);
        console.log(`${name.padEnd(36)} ${peer.displayName}`);
      }
      await client.destroy();
    });

  const research = program.command('research').description('Market research reports');

  research
    .command('extract')
    .description('Ask the model about posts with no answer yet and print what it found')
    .option('--limit <n>', 'Posts to send', '20')
    .option('--calibrate', 'Posts whose pay the rules already know first, to measure agreement')
    .action(async (options: { limit: string; calibrate?: boolean }) => {
      const { extractionEnabled, runModelExtraction } = await import('../research/model.ts');
      const { deriveRecord } = await import('../research/derive.ts');
      await withRuntime(async (runtime) => {
        if (!extractionEnabled(runtime.env)) throw new Error('Set RADAR_EXTRACT_ENABLED=true and the provider key (OPENAI_API_KEY or GIGACHAT_AUTH_KEY) first');
        const summary = await runModelExtraction(runtime, { limit: Math.max(1, Number(options.limit) || 20), withPayFirst: options.calibrate });
        console.log(`Отправлено: ${summary.asked}, сохранено: ${summary.saved}, ошибок: ${summary.failed}`);
        for (const id of summary.ids) {
          const lead = await runtime.store.getLead(id);
          const facts = (lead?.metadata?.model as import('../research/model.ts').StoredModelFacts | undefined)?.facts;
          if (!lead || !facts) continue;
          const rules = deriveRecord(lead, { useModel: false });
          const pay = facts.currency ? `${facts.payMin ?? ''}–${facts.payMax ?? ''} ${facts.currency}/${facts.period}` : '-';
          console.log(`${lead.title.slice(0, 50).padEnd(50)} | ${facts.isPost ? '' : 'НЕ ВАКАНСИЯ '}${Math.round(facts.confidence * 100)}% | модель: ${facts.role ?? '-'} ${facts.grade ?? '-'} ${pay} | правила: ${rules.role} ${rules.grade ?? '-'} ${rules.pay ?? '-'}`);
        }
      });
    });

  research
    .command('check')
    .description('Compare the model with the rules where both answer: is it good enough to count?')
    .option('--days <n>', 'Posts of the last N days', '30')
    .action(async (options: { days: string }) => {
      const { modelQuality, share, APPLY_AGREEMENT } = await import('../research/quality.ts');
      await withRuntime(async (runtime) => {
        const from = new Date(Date.now() - Math.max(1, Number(options.days) || 30) * 86_400_000).toISOString();
        const leads = (await runtime.store.listLeadsForResearch?.({ from, to: new Date().toISOString(), limit: 100_000 })) ?? [];
        const q = modelQuality(leads);
        const pct = (a: { n: number; agree: number }): string => (a.n ? `${Math.round(share(a)! * 100)}% (n = ${a.n})` : 'нет данных');
        console.log(`Ответов модели: ${q.answered}, уверенных: ${q.confident}, из них не вакансии: ${q.notPost}`);
        console.log(`Совпадение с правилами: направление ${pct(q.role)}, уровень ${pct(q.grade)}, оплата ${pct(q.pay)}`);
        console.log(`Модель добавит: направление ${q.gain.role}, уровень ${q.gain.grade}, оплату ${q.gain.pay}`);
        for (const d of q.disagreements) console.log(`  ${d.field}: правила ${d.rules} / модель ${d.model} — ${d.title}`);
        console.log(q.ready
          ? `Готово: совпадение ≥ ${APPLY_AGREEMENT * 100}% на направлении и оплате. Можно включить RADAR_EXTRACT_APPLY=true.`
          : `Пока не включать: нужно ≥ ${APPLY_AGREEMENT * 100}% совпадения на направлении и оплате, по 30+ сравнений (для оплаты: research extract --calibrate).`);
        console.log(`Сейчас в цифрах: ${runtime.env.RADAR_EXTRACT_APPLY ? 'ответы модели используются' : 'ответы модели не используются'}.`);
      });
    });

  research
    .command('daily')
    .description('Save the daily counts of the openradar index; --from redoes the days from a date')
    .option('--from <day>', 'Redo from this day, e.g. 2026-10-27')
    .action(async (options: { from?: string }) => {
      if (options.from && !/^\d{4}-\d{2}-\d{2}$/.test(options.from)) throw new Error('Day must look like 2026-10-27');
      const { ensureDailyCounts, PANEL_START, addDays } = await import('../research/index.ts');
      await withRuntime(async (runtime) => {
        const from = options.from && options.from > PANEL_START ? options.from : PANEL_START;
        if (options.from) {
          // Wipe the days from the date so the next run counts them again.
          const today = new Date().toISOString().slice(0, 10);
          for (let d = from; d < today; d = addDays(d, 1)) await runtime.store.saveResearchDaily?.(d, []);
        }
        const days = await ensureDailyCounts(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
        console.log(days.length ? `Сохранены дни: ${days[0]} — ${days.at(-1)} (${days.length})` : 'Новых дней нет');
      });
    });

  research
    .command('snapshot <month>')
    .description('Build and freeze the report for a month, e.g. 2026-10 (replaces a saved one)')
    .action(async (month: string) => {
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must look like 2026-10');
      const { buildMonthReport } = await import('../research/service.ts');
      await withRuntime(async (runtime) => {
        const report = await buildMonthReport(runtime.store, month, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
        await runtime.store.saveResearchSnapshot?.(month, report);
        console.log(`${report.period.label}: ${report.totals.posts} публикаций, медиана ${report.jobs.pay.median ?? '—'} ₽ (n = ${report.jobs.pay.n})`);
      });
    });

  program
    .command('mcp')
    .description('Run the Model Context Protocol (MCP) server over stdio')
    .action(async () => {
      // The stdio loop outlives this action: keep the runtime open until stdin closes.
      const runtime = await createRuntime();
      const { startMcpStdio } = await import('../mcp/server.ts');
      await startMcpStdio({
        listLeads: (options) => runtime.store.listLeads(options),
        getLead: (id) => runtime.store.getLead(id),
      });
      await runtime.store.close();
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
