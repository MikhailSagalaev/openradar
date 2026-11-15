// Live check of the UK sponsor-register matcher (plan 021D). Maintainer tool, not CI:
// downloads the real register once and reports how a set of known employers resolves.
// Run: node --experimental-transform-types scripts/check-visa-sponsors.mjs
import { buildSponsorIndex, lookupSponsor, sponsorCsvLink, UK_SPONSOR_PAGE } from '../src/research/visa-sponsors.ts';

const UA = { 'User-Agent': 'openradar-maintainer/1.0 (+https://openradar.fun)', Accept: 'text/html,text/csv' };

const page = await fetch(UK_SPONSOR_PAGE, { headers: UA, signal: AbortSignal.timeout(30_000) });
if (!page.ok) throw new Error(`page ${page.status}`);
const link = sponsorCsvLink(await page.text(), UK_SPONSOR_PAGE);
if (!link) throw new Error('no csv link');
console.log('register edition:', link.registerDate ?? 'unknown', link.url);
const csv = await fetch(link.url, { headers: UA, signal: AbortSignal.timeout(120_000) });
if (!csv.ok) throw new Error(`csv ${csv.status}`);
const text = await csv.text();
const index = buildSponsorIndex(text, { fetchedAt: new Date().toISOString(), ...(link.registerDate ? { registerDate: link.registerDate } : {}) });
console.log(`rows: ${index.rows}, indexed names: ${index.byKey.size}`);

const probes = [
  'Monzo Bank Ltd', 'Monzo', 'Deliveroo', 'Roofoods Ltd', 'Revolut Ltd', 'Google (UK) Limited',
  'Amazon UK Services Ltd', 'Wise Payments Ltd', 'Starling Bank Limited', 'Checkout Ltd',
  'Bolt Operations OÜ', 'Spotify Ltd', 'Goldman Sachs International', 'Jane Street Europe Limited',
  'OpenAI', 'Anthropic', 'Mistral AI', 'Cursor', 'ElevenLabs', 'Cohere',
  ' Totally Made Up Company Ltd',
];
let hits = 0;
for (const name of probes) {
  const hit = lookupSponsor(index, name);
  if (hit) hits++;
  console.log(`${hit ? 'SPONSOR' : '   —   '}  ${name}${hit ? `  →  ${hit.name} [${hit.route ?? '?'}]` : ''}`);
}
console.log(`matched ${hits}/${probes.length} probes`);
