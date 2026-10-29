import { describe, expect, it } from 'vitest';
import { SOURCE_PRESETS } from '../../src/sources/presets.ts';

describe('source presets', () => {
  it('keep regular expressions intact', () => {
    const getmatch = SOURCE_PRESETS.find((p) => p.id === 'getmatch')!;
    const pattern = new RegExp(String(getmatch.config.pattern));
    expect('https://getmatch.ru/vacancies/36738-data-scientist'.match(pattern)?.[1]).toBe('36738');
  });
});
