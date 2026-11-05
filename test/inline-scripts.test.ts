import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime, makeUserSession } from './helpers.ts';

/** Scripts written into the page as they are: an error in one kills everything it holds. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\b(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
}

describe('inline scripts', () => {
  it('parse on the pages of a signed-in member', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);
    const pages = ['/', '/submit', '/me', '/sources', '/sources/new', '/extension', '/network', '/research', '/about', '/faq'];
    let checked = 0;
    for (const path of pages) {
      const response = await app.request(path, { headers: { cookie: `radar_session=${session}` } });
      if (response.status !== 200) continue;
      for (const code of inlineScripts(await response.text())) {
        expect(() => new Function(code), path).not.toThrow();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('keep the line break in the skills separator of the submit form', async () => {
    const runtime = makeTestRuntime();
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);
    const html = await (await app.request('/submit', { headers: { cookie: `radar_session=${session}` } })).text();
    expect(html).toContain(String.raw`skillsInput.value.split(/[,;\n]+/)`);
  });
});
