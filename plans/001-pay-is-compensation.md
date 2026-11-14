# Plan 001: Stop ad spend and client budgets from becoming pay

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions happens, stop and report. Do not improvise. When done, set this plan's status row in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/core/salary.ts src/core/prepare.ts src/core/store.ts src/store/postgres.ts src/store/memory.ts src/pipeline/rescore.ts src/research/facts.ts src/research/derive.ts test/salary.test.ts test/rescore.test.ts`
> If any of those files changed since `f02a024`, compare the excerpts below with the live code. On a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

The ranked feed sorts by `scoreLead`. A post whose first currency amount is an advertising budget gets that amount as `budget`, then `normalizeSalary` treats anything above $25,000 with no year marker as a yearly salary and divides by 12. The card still shows the huge number, and `moneyPoints` adds the top pay bonus, so the card sits at the top of the home feed.

Confirmed on the live hub, 9 November 2026:

- Lead `41563735-6a58-483b-a944-1b7871ae0028`, score 98. Text says the team spends `$100,000+` a month on Facebook Ads and pays `$3,000/месяц`. Stored: `budget: 100000`, `currency: USD`, `rawSalary: "100000 USD per year"`, `normalizedUsdMin: 8333`.
- Lead `82e4d5f2-8e1c-4459-9c72-855718c504ee`, score 96. The only sum is `проекты с бюджетом до 1,5 млн руб`. Stored: `budget: 1500000`, `currency: RUB`.

`radar rescore` does not repair this. It calls `prepareRawLead` with the stored `budget` and `rawSalary`, and `normalizeSalary` trusts `rawSalary` over the text.

## Current state

- `src/core/salary.ts` — pay parsing for the feed. `NOT_PAY_WORDS` masks revenue and funding, not ad spend or a client's project budget. `extractAnchoredSalary` returns the first anchored amount. `YEARLY_SALARY_FLOOR_USD = 25_000`. `detectPaymentPeriod` recognizes `в час`, `/час`, `per hour`, `/hr`, `$/h`, `hourly`. It does not recognize `PLN/h`.
- `src/core/prepare.ts` — `explicitBudget ?? extractedMoney.budget`, then `normalizeSalary({ text, rawSalary, budget, currency, type })`.
- `src/pipeline/rescore.ts` — passes the stored budget and rawSalary back into `prepareRawLead`. `updateLeadScore` updates the score only.
- `src/store/postgres.ts` `saveLeadFacts` — fills normalized USD only when both min and max are null. It must not be reused to overwrite a wrong salary.
- `src/research/facts.ts` — schema.org `DAY` and `WEEK` are mapped to period `month` with no multiplier (`UNIT_PERIOD`).
- `src/research/derive.ts` `parsePayText` — a second parser. Research uses it before the stored budget. Masking has to happen here too, or the report repeats the feed's mistake.
- Tests: `test/salary.test.ts`. This assertion must keep passing: `normalizeSalary({ rawSalary: '$120,000 - $180,000', type: 'job' }).normalizedUsdMax` is `15000`.
- Commit style: `fix(salary): ignore ad spend when the post states a monthly salary`.

Excerpt, `src/core/salary.ts` (the yearly rule and the rawSalary shortcut):

```ts
if (input.rawSalary) {
  const parsed = parseSalaryRange(input.rawSalary);
  // ...
} else {
  const anchored = extractAnchoredSalary(input.text ?? '');
}
// ...
const yearly =
  period !== 'hourly' &&
  !perDay &&
  (input.type === 'job' || period === 'monthly') &&
  (yearlyMarker || (usdMax ?? usdMin ?? 0) > YEARLY_SALARY_FLOOR_USD);
```

Excerpt, `src/research/facts.ts`:

```ts
const UNIT_PERIOD: Record<string, PageSalary['period']> = {
  HOUR: 'hour',
  DAY: 'month',
  WEEK: 'month',
  MONTH: 'month',
  YEAR: 'year',
};
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Salary tests | `pnpm test -- test/salary.test.ts test/rescore.test.ts` | all pass |
| Full tests | `pnpm test` | all pass |

There is no lint script. Do not add one.

## Scope

**In scope**:

- `src/core/salary.ts`
- `src/core/prepare.ts`
- `src/core/store.ts`
- `src/store/postgres.ts`
- `src/store/memory.ts`
- `src/pipeline/rescore.ts`
- `src/research/facts.ts`
- `src/research/derive.ts` (call the mask only; do not rewrite `parsePayText`)
- `test/salary.test.ts`
- `test/rescore.test.ts`
- `plans/README.md` (status row only)

**Out of scope**:

- `src/core/rules.ts` `moneyPoints` — the bonus is fine once the amount is real.
- `src/research/report.ts` — plan 004 and plan 006.
- A historical SQL update run by hand. The rescore path is the backfill.
- Deleting `YEARLY_SALARY_FLOOR_USD`.

## Git workflow

- Branch: `advisor/001-pay-is-compensation`
- One commit for the parser and tests, one commit for rescore plus the store method, if that split stays green. Message style: `fix(salary): ignore ad spend when the post states a monthly salary`
- Do not push.

## Steps

### Step 1: Mask money that is not compensation

In `src/core/salary.ts`, export `maskNonPayMoney(text: string): string`.

Split the text on newlines and on `.` `!` `?` (keep the separators). In a sentence, replace every digit with `#` when the sentence matches:

```ts
/бюджет|спенд|ad\s*spend|facebook ads|откруч|заливаем|запускаем\s+ежемесячно|управлени[ея]\s+бюджет|проекты?\s+с\s+бюджетом/i
```

Do not mask a sentence that also matches `/зарплат|оклад|ставк[аиу]/i`. A sentence can mention a budget and a salary; leave that sentence for step 2.

Call `maskNonPayMoney` at the start of `extractAnchoredSalary` and inside `normalizeSalary` on `input.text` before period and currency detection when `rawSalary` is absent.

In `src/research/derive.ts` `parsePayText`, run the same function on the text before the existing patterns. Import it. Do not change the patterns.

**Verify**: `pnpm test -- test/salary.test.ts` → the existing tests still pass.

### Step 2: Prefer a compensation sentence when several amounts remain

Still in `extractAnchoredSalary`: after masking, if one sentence matches `/зарплат|оклад|ставк|compensation|\bsalary\b|в месяц|\/месяц|per month|\/мес/i` and contains an anchored amount, return that amount. Otherwise keep today's first-amount behavior.

The yearly heuristic stays. It must see the compensation amount, not the spend. `$120,000 - $180,000` with no month marker still divides by 12.

Add tests in `test/salary.test.ts`:

- Text `запускаем ежемесячно $100,000+ на Facebook Ads` plus a later `$3,000/месяц на старте`, type `job`. Expect `paymentPeriod === 'monthly'`, `normalizedUsdMin` and `normalizedUsdMax` equal to 3000, and `rawSalary` not matching `/per year/i`.
- Text `Интересные проекты с бюджетом до 1,5 млн руб` and no other amount, type `job`. Expect `normalizedUsdMin` and `normalizedUsdMax` to be `undefined` (the only sum was masked, and there is no stored budget).
- Existing `$120,000 - $180,000` case still expects `normalizedUsdMax === 15000`.
- `detectPaymentPeriod('Wynagrodzenie: do 105 PLN/h')` is `'hourly'`. Also accept `zł/h`, `руб/час` (already works), and `€/h`. A job with only `105 PLN/h` must not come back as `paymentPeriod: 'monthly'` with normalized USD equal to `105 / 4.05` rounded. Hourly 105 PLN is about $26, so `normalizedUsdMax` is 26 when currency is PLN.

**Verify**: `pnpm test -- test/salary.test.ts` → all pass, including the four new cases.

### Step 3: Scale schema.org day and week rates

In `src/research/facts.ts` `salaryOf`, stop mapping `DAY` and `WEEK` onto `month` unchanged.

- `DAY`: multiply min and max by 21, period `month`.
- `WEEK`: multiply min and max by 4, period `month`.
- `HOUR` and `YEAR` stay as they are.

Add a test that builds a minimal JSON-LD `JobPosting` with `unitText: DAY` and `value: 5000`, currency RUB, and expects min and max `105000` and period `month`. Put it next to the other research tests (`test/research.test.ts` if that file already imports from `src/research/facts.ts`; otherwise create `test/facts-salary.test.ts`).

**Verify**: `pnpm test -- test/facts-salary.test.ts test/research.test.ts` → pass. If `test/facts-salary.test.ts` was not created, the research file's new test passes.

### Step 4: Rescore can replace a wrong stored salary

Add optional `updateLeadPay` on `Store` in `src/core/store.ts`:

```ts
updateLeadPay?(id: string, pay: {
  budget?: number;
  currency?: string;
  rawSalary?: string;
  paymentPeriod?: 'monthly' | 'hourly' | 'fixed';
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
}): Promise<void>;
```

Implement it in `src/store/postgres.ts` and `src/store/memory.ts`. The SQL sets `budget`, `currency`, `raw_salary`, `payment_period`, `normalized_usd_min`, `normalized_usd_max`. Use NULL for an absent normalized bound. Do not call `saveLeadFacts`.

In `rescoreLeads`, before `prepareRawLead`:

1. `const fromText = normalizeSalary({ text: `${lead.title}\n${lead.text}`, type: lead.type === 'job' ? 'job' : 'gig' })`.
2. If `fromText.normalizedUsdMin` / `Max` differ from the stored values, or the stored pay is set and `fromText` has no pay, call `updateLeadPay`.
3. Pass the new budget, currency, and rawSalary into `prepareRawLead`, not the old ones. If `fromText` has no pay, pass `budget: undefined` and `rawSalary: undefined` so the old spend is not scored again.

Add one case to `test/rescore.test.ts` using the in-memory store: a job whose text has `$100,000+` ad spend and `$3,000/месяц`, stored budget `100000` USD. After `rescoreLeads`, budget is 3000, period is monthly, normalized USD is 3000, and the score is not the score of an $8,333/month job. Compute the expected score with `scoreLead` on the reparsed lead rather than hard-coding 98.

**Verify**: `pnpm test -- test/rescore.test.ts test/salary.test.ts` → all pass.

### Step 5: Full check

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → all pass. `git status --short` lists only the in-scope files plus this plan's status row.

## Test plan

- Pattern: `test/salary.test.ts` (vitest, import the function, `expect`).
- Cases named in steps 2 and 3, plus the rescore case in step 4.
- Do not delete the `$120,000 - $180,000` → 15000 test.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `test/salary.test.ts` contains the Facebook Ads `$100,000` / `$3,000` case and the `1,5 млн` budget case
- [ ] `detectPaymentPeriod` test covers `PLN/h`
- [ ] `git status --short` shows no files outside the in-scope list
- [ ] `plans/README.md` row 001 is DONE

## STOP conditions

- The yearly-floor excerpt or the `rawSalary` branch is not in `src/core/salary.ts`.
- Making `$120,000 - $180,000` stay yearly requires a behavior change you cannot cover with the existing test.
- `updateLeadScore` is the only write path and adding `updateLeadPay` would require a migration. It is an UPDATE of existing columns. If those columns are missing, STOP.
- The fix seems to require editing `src/core/rules.ts` or `src/research/report.ts`.

## Maintenance notes

- New board adapters that put the client's media budget in `rawSalary` bypass the text mask, because a present `rawSalary` is still trusted. Reviewers should check adapters that set `rawSalary` from the first number on the page.
- `maskNonPayMoney` is shared with research. A later change to the sentence list belongs in `salary.ts` only.
- Stored hub rows change only when someone runs rescore. Say that in the commit message. Do not run rescore against a production database from this plan.
