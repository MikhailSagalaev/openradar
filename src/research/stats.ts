// Pure statistical helpers for the research report: distribution tails, multiple-comparison
// adjustment, effect-size labels and the single decision rule used for hypotheses.
// Special functions follow Numerical Recipes (3rd ed., §6.1–6.4): Lanczos log-gamma,
// regularized incomplete gamma (series / Lentz continued fraction) and incomplete beta.

const EPS = 1e-15;
const FPMIN = 1e-300;
const MAX_ITER = 1000;

const LANCZOS = [
  57.15623566586292, -59.59796035547549, 14.136097974741746, -0.4919138160976202,
  0.00003399464998481189, 0.00004652362892704858, -0.00009837447530487956, 0.0001580887032249125,
  -0.00021026444172410488, 0.00021743961811521265, -0.0001643181065367639, 0.00008441822398385275,
  -0.000026190838401581408, 0.0000036899182659531625,
];

/** ln Γ(x) for x > 0 (Lanczos, g = 671/128, n = 14; relative error < 1e-15). */
export function logGamma(x: number): number {
  if (!(x > 0)) throw new RangeError(`logGamma: x must be > 0, got ${x}`);
  let y = x;
  const tmp0 = x + 5.2421875;
  const tmp = (x + 0.5) * Math.log(tmp0) - tmp0;
  let ser = 0.9999999999999971;
  for (const c of LANCZOS) ser += c / ++y;
  return tmp + Math.log((2.5066282746310007 * ser) / x);
}

function gammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < MAX_ITER; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaContinuedFraction(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Upper tail of χ²(df): P(X ≥ x) = Q(df/2, x/2). */
export function chiSquareSf(x: number, df: number): number {
  if (!(df > 0)) return NaN;
  if (!(x > 0)) return 1;
  return clamp01(gammaQ(df / 2, x / 2));
}

/** Two-sided p for a standard normal statistic: P(|Z| ≥ |z|) = Q(1/2, z²/2). */
export function normalTwoSidedP(z: number): number {
  if (!Number.isFinite(z)) return Number.isNaN(z) ? NaN : 0;
  return clamp01(gammaQ(0.5, (z * z) / 2));
}

/** Two-sided p for Student t with df degrees of freedom: I_{df/(df+t²)}(df/2, 1/2). */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!(df > 0)) return NaN;
  if (!Number.isFinite(t)) return Number.isNaN(t) ? NaN : 0;
  return clamp01(betaInc(df / 2, 0.5, df / (df + t * t)));
}

/** Upper tail of F(d1, d2): P(X ≥ f) = I_{d2/(d2+d1·f)}(d2/2, d1/2). */
export function fSf(f: number, d1: number, d2: number): number {
  if (!(d1 > 0) || !(d2 > 0)) return NaN;
  if (!(f > 0)) return 1;
  return clamp01(betaInc(d2 / 2, d1 / 2, d2 / (d2 + d1 * f)));
}

/** Holm–Bonferroni step-down adjusted p-values, returned in input order. */
export function holmAdjust(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m).fill(1);
  let running = 0;
  order.forEach(({ p, i }, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    adjusted[i] = running;
  });
  return adjusted;
}

/** APA style: "< 0.001" or three decimals ("0.042", "1.000"). */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

export type Stars = "***" | "**" | "*" | "";

export function starsOf(p: number): Stars {
  return p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "";
}

export type EffectMagnitude = "negligible" | "small" | "medium" | "large";

function magnitude(value: number, small: number, medium: number, large: number): EffectMagnitude {
  const v = Math.abs(value);
  return v >= large ? "large" : v >= medium ? "medium" : v >= small ? "small" : "negligible";
}

/** Kruskal–Wallis ε² = H / (N − 1); 0.01 / 0.08 / 0.26 (Tomczak & Tomczak, 2014). */
export function epsilonSqMagnitude(epsilonSq: number): EffectMagnitude {
  return magnitude(epsilonSq, 0.01, 0.08, 0.26);
}

/** Cliff's δ; 0.147 / 0.33 / 0.474 (Romano et al., 2006). */
export function cliffsDeltaMagnitude(delta: number): EffectMagnitude {
  return magnitude(delta, 0.147, 0.33, 0.474);
}

/** Correlation coefficient r or ρ; 0.1 / 0.3 / 0.5 (Cohen, 1988). */
export function correlationMagnitude(r: number): EffectMagnitude {
  return magnitude(r, 0.1, 0.3, 0.5);
}

export const ALPHA = 0.05;

/**
 * The one decision rule for the report's hypotheses: the Holm-adjusted p is below α AND the
 * effect is at least "small" AND (for directional hypotheses) it points the predicted way.
 * With tens of thousands of observations almost any difference is significant, so
 * significance alone is not evidence of a meaningful difference.
 */
export function isConfirmed(pAdjusted: number, effect: EffectMagnitude, directionHolds = true): boolean {
  return directionHolds && pAdjusted < ALPHA && effect !== "negligible";
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
