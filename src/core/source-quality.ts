/**
 * How good a source is, by what openradar promises its readers: a post is reachable, alive, real
 * and worth opening. The score is plain arithmetic over counters anyone can recount from the
 * database, so a source owner can see why it stands where it stands. Its parts and weights are
 * described in docs/QUALITY.md. A part with no data does not count against a source.
 */

export interface SourceQualityInput {
  /** Polls in the window and how many failed. */
  runs: number;
  failedRuns: number;
  /** Posts it brought in the window, and posts turned down at the door. */
  inserted: number;
  rejected: number;
  /** Of the posts it brought: closed since, vacancies among them, and what they carry. */
  closed: number;
  jobs: number;
  withEmployer: number;
  withPay: number;
  fullText: number;
  /** What readers said about those posts. */
  useful: number;
  junk: number;
  scam: number;
}

export type QualityPart = 'access' | 'flow' | 'filter' | 'alive' | 'complete' | 'trust';
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'new';

export const QUALITY_WEIGHTS: Record<QualityPart, number> = {
  access: 30,
  flow: 20,
  filter: 10,
  alive: 20,
  complete: 10,
  trust: 10,
};

/** Polls before a source is judged. */
export const QUALITY_MIN_RUNS = 5;
/** New posts in the window that count as a full flow; less grows on a log scale. */
const FULL_FLOW = 30;
/** Posts before their shares mean anything. */
const MIN_POSTS = 5;
/** Votes before readers' opinion counts. */
const MIN_VOTES = 3;

export interface SourceQuality {
  score: number | null;
  grade: QualityGrade;
  parts: Partial<Record<QualityPart, number>>;
}

export function scoreSource(input: SourceQualityInput): SourceQuality {
  if (input.runs < QUALITY_MIN_RUNS) return { score: null, grade: 'new', parts: {} };
  const parts: Partial<Record<QualityPart, number>> = {
    access: 1 - input.failedRuns / input.runs,
    flow: Math.min(1, Math.log2(1 + input.inserted) / Math.log2(1 + FULL_FLOW)),
  };
  const seen = input.inserted + input.rejected;
  if (seen >= MIN_POSTS) parts.filter = input.inserted / seen;
  if (input.inserted >= MIN_POSTS) {
    parts.alive = 1 - input.closed / input.inserted;
    const carried = [input.withPay / input.inserted, input.fullText / input.inserted];
    if (input.jobs >= MIN_POSTS) carried.push(input.withEmployer / input.jobs);
    parts.complete = carried.reduce((sum, share) => sum + share, 0) / carried.length;
  }
  const votes = input.useful + input.junk + input.scam;
  // A scam report weighs three: it costs a reader more than a useful post gives.
  if (votes >= MIN_VOTES) parts.trust = input.useful / (input.useful + input.junk + input.scam * 3);

  const known = Object.keys(parts) as QualityPart[];
  const weight = known.reduce((sum, part) => sum + QUALITY_WEIGHTS[part], 0);
  const score = Math.round((known.reduce((sum, part) => sum + parts[part]! * QUALITY_WEIGHTS[part], 0) / weight) * 100);
  return { score, grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D', parts };
}

/** What a person may say about a post when checking it by hand. */
export const LABEL_VERDICTS = ['good', 'closed', 'wrong_type', 'junk'] as const;
export type LabelVerdict = (typeof LABEL_VERDICTS)[number];

/** A reader's answer, if it is one of the four. */
export function normalizeReviewVerdict(value: unknown): LabelVerdict | undefined {
  return (LABEL_VERDICTS as readonly unknown[]).includes(value) ? (value as LabelVerdict) : undefined;
}

/** What readers agree on: three answers at least and two of three alike. One answer is an opinion. */
export function reviewConsensus(verdicts: string[]): string | undefined {
  if (verdicts.length < 3) return undefined;
  const counts = new Map<string, number>();
  for (const verdict of verdicts) counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  const [top, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return votes / verdicts.length >= 2 / 3 ? top : undefined;
}
