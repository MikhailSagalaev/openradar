/**
 * OpenRadar Extension Cryptographic & Mesh Node Module.
 * NIP-01 canonical hashing and NIP-07-only signing: the extension never creates,
 * stores or transmits private key material. Identity and signatures come
 * exclusively from the user's NIP-07 signer (window.nostr, e.g. Alby).
 */

/**
 * Computes SHA-256 hash using Web Crypto API.
 */
export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical Nostr NIP-01 Event ID serialization:
 * sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))
 */
export async function computeEventId(event) {
  const serialized = JSON.stringify([
    0,
    event.pubkey.toLowerCase(),
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256Hex(serialized);
}

/**
 * Local PII scrubber running inside extension sandbox before any network transmission.
 */
export function scrubPIILocal(rawText, sourceUrl = '') {
  if (!rawText) {
    return { text: '', isActionable: false };
  }

  let text = rawText;

  // Mask emails
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[contact hidden]');

  // Mask phone numbers
  text = text.replace(/(?:\+?[78][-\s(]*)?\d{3}[-\s)]*\d{3}[-\s]*\d{2}[-\s]*\d{2}/g, '[contact hidden]');

  // Mask personal handles near contact triggers
  text = text.replace(
    /(?:лс|личк[а-я]*|пишите|контакт|dm|telegram|tg|тел)[^a-zA-Z0-9_@]{0,10}@([a-zA-Z0-9_]{4,32})/gi,
    (match) => match.replace(/@[a-zA-Z0-9_]+/, '[contact hidden]'),
  );

  const hasHiddenContacts = text.includes('[contact hidden]');
  const isActionable = Boolean(sourceUrl && sourceUrl.startsWith('http'));

  return {
    text,
    hasHiddenContacts,
    isActionable,
  };
}

/**
 * Builds and signs a radar/1 event Kind 30402 via the NIP-07 signer.
 * There is no local key fallback: a locally generated key (or a pseudo-signature)
 * would make events trivially forgeable and would put raw key material in
 * chrome.storage. Requires window.nostr (getPublicKey + signEvent).
 */
export async function buildAndSignExtensionLead(leadData) {
  if (
    typeof window === 'undefined' ||
    !window.nostr ||
    typeof window.nostr.getPublicKey !== 'function' ||
    typeof window.nostr.signEvent !== 'function'
  ) {
    throw new Error(
      'NIP-07 signer required: install a Nostr wallet extension (window.nostr) to publish radar/1 events',
    );
  }

  const scrubResult = scrubPIILocal(leadData.text, leadData.url);
  const contentHash = await sha256Hex(`${leadData.title}|${scrubResult.text.slice(0, 300)}`);

  const nowSec = Math.floor(Date.now() / 1000);
  const pubKey = await window.nostr.getPublicKey();

  const unsigned = {
    pubkey: pubKey.toLowerCase(),
    created_at: nowSec,
    kind: 30402, // RadarLead
    tags: [
      ['d', contentHash],
      ['u', leadData.url || ''],
      ['t', leadData.type || 'gig'],
      ['v', 'radar/1'],
    ],
    content: JSON.stringify({
      title: leadData.title,
      summary: scrubResult.text.slice(0, 1000),
      company: leadData.company,
      city: leadData.city,
      skills: leadData.skills || [],
    }),
  };

  const id = await computeEventId(unsigned);
  return await window.nostr.signEvent(unsigned);
}
