import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { escapeBareAmpersands } from '../../src/sources/rss.ts';
import { makeSource, pollContext } from '../helpers.ts';

describe('RSS feeds with bare ampersands', () => {
  it('escapes a bare & and leaves entities and CDATA alone', () => {
    expect(escapeBareAmpersands('<t>R&D &amp; QA &#38; &#x26; &nbsp;</t><![CDATA[a & b]]>'))
      .toBe('<t>R&amp;D &amp; QA &#38; &#x26; &nbsp;</t><![CDATA[a & b]]>');
  });

  it('reads a feed the strict parser used to drop', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>
      <item><title>R&D Engineer</title><link>https://example.com/jobs?id=1&ref=rss</link><description>Remote, team of 5</description></item>
    </channel></rss>`;
    const ctx = { ...pollContext(''), fetchImpl: async () => new Response(xml, { status: 200 }) };
    const leads = await createSourceRegistry().get('rss')!.poll!(makeSource({ kind: 'rss', config: { url: 'https://example.com/feed' } }), ctx);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.title).toBe('R&D Engineer');
    expect(leads[0]!.url).toBe('https://example.com/jobs?id=1&ref=rss');
  });
});
