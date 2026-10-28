import type { SourceAdapter, SourceKind } from '../core/types.ts';
import { hhSource } from './hh.ts';
import { hnSource } from './hn.ts';
import { imapSource } from './imap.ts';
import { kworkSource } from './kwork.ts';
import { remoteokSource } from './remoteok.ts';
import { remotiveSource } from './remotive.ts';
import { arbeitnowSource } from './arbeitnow.ts';
import { rssSource } from './rss.ts';
import { telegramSource } from './telegram.ts';
import { telegramAccountSource } from './telegram-account.ts';
import { trudvsemSource } from './trudvsem.ts';
import { webhookSource } from './webhook.ts';

export class SourceRegistry {
  private readonly adapters = new Map<SourceKind, SourceAdapter>();

  register(adapter: SourceAdapter): this {
    this.adapters.set(adapter.kind, adapter);
    return this;
  }

  get(kind: SourceKind): SourceAdapter | undefined {
    return this.adapters.get(kind);
  }

  list(): SourceAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createSourceRegistry(): SourceRegistry {
  return new SourceRegistry()
    .register(rssSource)
    .register(telegramSource)
    .register(telegramAccountSource)
    .register(kworkSource)
    .register(webhookSource)
    .register(imapSource)
    .register(trudvsemSource)
    .register(hhSource)
    .register(remoteokSource)
    .register(remotiveSource)
    .register(arbeitnowSource)
    .register(hnSource);
}

