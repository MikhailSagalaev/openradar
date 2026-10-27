import type { Logger, LogLevel } from './types.ts';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function formatMeta(meta: unknown): string {
  if (meta === undefined) return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' [meta unavailable]';
  }
}

class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly scope: string,
  ) {}

  private write(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${message}${formatMeta(meta)}`;
    // Logs go to stderr: stdout belongs to command output and to the MCP stdio protocol.
    process.stderr.write(`${line}\n`);
  }

  debug(message: string, meta?: unknown): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.write('error', message, meta);
  }

  child(scope: string): Logger {
    return new ConsoleLogger(this.level, `${this.scope}:${scope}`);
  }
}

export function createLogger(level: LogLevel = 'info', scope = 'radar'): Logger {
  return new ConsoleLogger(level, scope);
}
