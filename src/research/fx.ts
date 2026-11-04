/**
 * Bank of Russia rates for research. Pay published in a month is converted at the official
 * rate of the month's first day: one fixed rate per month keeps a frozen report and a rebuilt
 * one equal, and follows the rouble, which a constant in the code did not.
 */
import type { Store } from '../core/store.ts';
import { RUB_PER } from './derive.ts';

const CBR_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';
const WANTED = ['USD', 'EUR', 'GBP', 'KZT', 'BYN', 'UAH'];

/** Roubles per unit from the Bank of Russia's daily XML. */
export function parseCbrRates(xml: string): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const [, code, nominal, value] of xml.matchAll(/<CharCode>(\w+)<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d,]+)<\/Value>/g)) {
    if (!WANTED.includes(code!)) continue;
    const rate = Number.parseFloat(value!.replace(',', '.')) / Number(nominal);
    if (Number.isFinite(rate) && rate > 0) rates[code!] = Math.round(rate * 10_000) / 10_000;
  }
  return rates;
}

function monthsOf(now: Date): string[] {
  const month = (offset: number): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
  return [month(-1), month(0)];
}

/** Saves the rates of this month and the last one if they are missing; returns the months saved. */
export async function ensureFxRates(store: Store, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!store.listFxRates || !store.saveFxRates) return [];
  const known = await store.listFxRates();
  const saved: string[] = [];
  for (const month of monthsOf(now)) {
    if (known[month]) continue;
    const [year, mm] = month.split('-');
    const response = await fetchImpl(`${CBR_URL}?date_req=01/${mm}/${year}`);
    if (!response.ok) throw new Error(`Bank of Russia rates: HTTP ${response.status}`);
    const rates = parseCbrRates(await response.text());
    if (WANTED.some((code) => rates[code] === undefined)) throw new Error(`Bank of Russia rates for ${month} are incomplete`);
    await store.saveFxRates(month, rates);
    saved.push(month);
  }
  return saved;
}

/** Rates of a month, the reference table filling what is missing. */
export function ratesOf(month: string, fx: Record<string, Record<string, number>> | undefined): Record<string, number> {
  const rates = fx?.[month];
  if (!rates) return RUB_PER;
  return { ...RUB_PER, ...rates, USDT: rates.USD ?? RUB_PER.USD! };
}
