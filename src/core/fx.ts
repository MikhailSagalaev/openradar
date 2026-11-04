/**
 * Reference rates: roubles per unit, the Bank of Russia on 1 November 2026. The one table
 * for money across the service: the feed, the budget filter and /api/market read it, and
 * research falls back to it for a month with no saved rates. A change here needs
 * `radar requality --money`, since leads store their USD figures.
 */
export const RUB_PER: Record<string, number> = {
  RUB: 1,
  RUR: 1,
  USD: 80.56,
  USDT: 80.56,
  USDC: 80.56,
  EUR: 89.66,
  GBP: 107.75,
  KZT: 0.178,
  BYN: 27.34,
  UAH: 1.77,
  PLN: 19.89,
  CHF: 91.55,
  AUD: 53,
  CAD: 59.24,
};

/** How many USD one unit is worth. */
export function usdPer(currency: string): number | undefined {
  const rub = RUB_PER[currency.toUpperCase()];
  return rub === undefined ? undefined : rub / RUB_PER.USD!;
}
