/**
 * Readers rate posts one at a time. Answers are data, not power: a reader never hides a post.
 * Three answers make a decision when two agree, a reader who keeps missing the control posts
 * stops counting, and what they agree on goes to a person, the source scores and the model.
 * See docs/DECISIONS.md.
 */

export const REVIEW_VERDICTS = ['ok', 'not_work', 'suspicious', 'closed', 'unsure'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const REVIEW_ISSUES = ['text_cut', 'no_pay', 'no_company', 'format', 'duplicate'] as const;
export type ReviewIssue = (typeof REVIEW_ISSUES)[number];

export type ReviewBucket = 'random' | 'doubt' | 'control';

export interface LeadReview {
  leadId: string;
  userId: number;
  verdict: ReviewVerdict;
  typeFix?: string;
  directionFix?: string;
  issues: ReviewIssue[];
  note?: string;
  shownType?: string;
  shownDirection?: string;
  bucket?: ReviewBucket;
}

export function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return (REVIEW_VERDICTS as readonly unknown[]).includes(value);
}

/** A reader's answer in the words of the hand-checked set. */
export function labelOfReview(verdict: ReviewVerdict, typeFix?: string): string {
  if (verdict === 'ok') return typeFix ? 'wrong_type' : 'good';
  return { not_work: 'junk', suspicious: 'scam', closed: 'closed', unsure: 'skip' }[verdict];
}

/** Which kind of post comes next: most at random, to measure honestly. */
export function pickBucket(roll: number): ReviewBucket {
  if (roll < 0.1) return 'control';
  return roll < 0.4 ? 'doubt' : 'random';
}

/** What readers agree on: three answers at least and two of three alike. */
export function reviewConsensus(verdicts: string[]): string | undefined {
  const answers = verdicts.filter((verdict) => verdict !== 'unsure');
  if (answers.length < 3) return undefined;
  const counts = new Map<string, number>();
  for (const verdict of answers) counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  const [top, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return votes / answers.length >= 2 / 3 ? top : undefined;
}

/** Control posts before a reader is judged, and the share they must get right. */
export const TRUST_MIN_CONTROLS = 10;
export const TRUST_MIN_AGREEMENT = 0.6;

export function trusted(controls: number, agreed: number): boolean {
  return controls < TRUST_MIN_CONTROLS || agreed / controls >= TRUST_MIN_AGREEMENT;
}
