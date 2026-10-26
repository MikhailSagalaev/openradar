import { z } from 'zod';
import { mergeContacts, normalizeContact } from './contacts.ts';
import type { Contact, RawLead, SourceRef } from './types.ts';

/**
 * radar/2 observation: what any parser sends when it sees a post.
 * Only `source.platform`, `source.channel` and `text` are required; the node or
 * hub derives everything else. See docs/PROTOCOL.md.
 */

const platform = z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{1,32}$/, 'platform: [a-z0-9_.-]{1,32}');
const shortText = (max: number) => z.string().trim().max(max);
const isoDate = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO 8601 date');

export const ObservationSchema = z.object({
  schema: z.literal('radar/2.observation').optional(),
  source: z.object({
    platform,
    channel: shortText(256).min(1),
    channel_title: shortText(256).nullish(),
    visibility: z.enum(['public', 'private', 'invite']).default('public'),
    message_id: z.union([z.string(), z.number()]).transform(String).pipe(shortText(128)).nullish(),
    url: shortText(2048).nullish(),
  }),
  posted_at: isoDate.nullish(),
  observed_at: isoDate.nullish(),
  edited_at: isoDate.nullish(),
  author: z.object({
    name: shortText(256).nullish(),
    handle: shortText(256).nullish(),
    contacts: z.array(z.object({ type: z.string().max(32), value: z.string().max(256) })).max(20).default([]),
  }).partial().nullish(),
  title: shortText(500).nullish(),
  text: z.string().min(1).max(20_000),
  type: z.enum(['job', 'gig']).nullish(),
  budget: z.object({
    min: z.number().nonnegative().nullish(),
    max: z.number().nonnegative().nullish(),
    currency: shortText(8).nullish(),
    period: z.enum(['month', 'hour', 'day', 'fixed', 'project']).nullish(),
  }).nullish(),
  skills: z.array(shortText(64)).max(50).nullish(),
  location: z.object({
    city: shortText(128).nullish(),
    country: shortText(64).nullish(),
    remote: z.boolean().nullish(),
  }).nullish(),
  lang: shortText(16).nullish(),
  raw: z.record(z.string(), z.unknown()).nullish(),
});

export type Observation = z.infer<typeof ObservationSchema>;

export interface ObservationParseResult {
  ok: boolean;
  observation?: Observation;
  error?: string;
}

export function parseObservation(input: unknown): ObservationParseResult {
  const parsed = ObservationSchema.safeParse(input);
  if (parsed.success) return { ok: true, observation: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'observation'}: ${issue.message}` : 'invalid observation' };
}

const PERIOD: Record<string, RawLead['paymentPeriod']> = {
  month: 'monthly',
  hour: 'hourly',
  day: 'fixed',
  fixed: 'fixed',
  project: 'fixed',
};

/** Stable key of one post on one platform, when the parser knows its message id. */
export function postKeyOf(ref: Pick<SourceRef, 'platform' | 'channel' | 'messageId'>): string | undefined {
  return ref.messageId ? `${ref.platform}:${ref.channel}:${ref.messageId}` : undefined;
}

/** Author handle as a contact, when it looks like one (`@name` is a Telegram handle). */
function authorContacts(observation: Observation): Contact[] {
  const author = observation.author;
  if (!author) return [];
  const listed = (author.contacts ?? [])
    .map((c) => normalizeContact(c.type, c.value))
    .filter((c): c is Contact => c !== null);
  const handle = author.handle?.startsWith('@') ? normalizeContact('telegram', author.handle) : null;
  return mergeContacts(listed, handle ? [handle] : []);
}

export function observationToRawLead(observation: Observation, sourceId: string): RawLead {
  const source = observation.source;
  const sourceRef: SourceRef = {
    platform: source.platform,
    channel: source.channel,
    channelTitle: source.channel_title ?? undefined,
    visibility: source.visibility,
    messageId: source.message_id ?? undefined,
  };
  const budget = observation.budget;
  const amount = budget?.max ?? budget?.min ?? undefined;
  const title = observation.title?.trim() || observation.text.split('\n').map((l) => l.trim()).find(Boolean) || '';
  return {
    sourceId,
    type: observation.type ?? undefined,
    externalId: postKeyOf(sourceRef),
    url: source.url ?? undefined,
    title,
    text: observation.text,
    author: observation.author?.name ?? observation.author?.handle ?? undefined,
    city: observation.location?.city ?? undefined,
    budget: amount ?? undefined,
    currency: budget?.currency ?? undefined,
    paymentPeriod: budget?.period ? PERIOD[budget.period] : undefined,
    skills: observation.skills ?? undefined,
    isRemote: observation.location?.remote ?? undefined,
    publishedAt: observation.posted_at ?? observation.observed_at ?? undefined,
    contacts: authorContacts(observation),
    sourceRef,
    metadata: observation.lang ? { lang: observation.lang } : undefined,
  };
}
