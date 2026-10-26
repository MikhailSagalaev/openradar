import { describe, expect, it } from 'vitest';
import {
  isAllowedAttestationDomain,
  AttestationRateLimiter,
  ATTESTATION_ALLOWED_DOMAINS,
} from '../src/net/attestation-guard.ts';

describe('Attestation Guard & Whitelist', () => {
  it('allows approved freelance and job board domains and subdomains', () => {
    expect(isAllowedAttestationDomain('https://fl.ru/projects/123')).toBe(true);
    expect(isAllowedAttestationDomain('https://www.fl.ru/projects/123')).toBe(true);
    expect(isAllowedAttestationDomain('https://habr.com/vacancies/456')).toBe(true);
    expect(isAllowedAttestationDomain('https://career.habr.com/vacancies/456')).toBe(true);
    expect(isAllowedAttestationDomain('https://kwork.ru/projects/789')).toBe(true);
    expect(isAllowedAttestationDomain('https://t.me/s/freelance_orders')).toBe(true);
    expect(isAllowedAttestationDomain('https://hh.ru/vacancy/1000')).toBe(true);
    expect(isAllowedAttestationDomain('https://remoteok.com/remote-jobs/1')).toBe(true);
    expect(isAllowedAttestationDomain('https://weworkremotely.com/jobs/1')).toBe(true);
    expect(isAllowedAttestationDomain('https://opendata.trudvsem.ru/api/v1/vacancies')).toBe(true);
    expect(isAllowedAttestationDomain('https://openradar.fun/leads/abc')).toBe(true);
  });

  it('strictly rejects arbitrary victim or unlisted domains', () => {
    expect(isAllowedAttestationDomain('https://victim.example/page')).toBe(false);
    expect(isAllowedAttestationDomain('http://169.254.169.254/metadata')).toBe(false);
    expect(isAllowedAttestationDomain('https://malicious-site.com/exploit')).toBe(false);
    expect(isAllowedAttestationDomain('not-a-valid-url')).toBe(false);
    expect(isAllowedAttestationDomain('file:///etc/passwd')).toBe(false);
  });

  it('rate-limits attestation checks per domain and per pubkey', () => {
    const limiter = new AttestationRateLimiter(2, 3);
    const pubkeyA = 'pubkey-a';
    const pubkeyB = 'pubkey-b';
    const domainUrl = 'https://fl.ru/project/1';

    // 1st and 2nd for fl.ru from pubkeyA: OK
    expect(limiter.canAttest(domainUrl, pubkeyA)).toBe(true);
    expect(limiter.canAttest(domainUrl, pubkeyA)).toBe(true);

    // 3rd for fl.ru: blocked by domain limit (max 2)
    expect(limiter.canAttest(domainUrl, pubkeyA)).toBe(false);
    expect(limiter.canAttest(domainUrl, pubkeyB)).toBe(false);

    // Another domain for pubkeyA: OK (3rd hit for pubkeyA, max 3)
    expect(limiter.canAttest('https://habr.com/job/2', pubkeyA)).toBe(true);

    // 4th hit for pubkeyA on another domain: blocked by pubkey limit
    expect(limiter.canAttest('https://kwork.ru/want/3', pubkeyA)).toBe(false);

    // But pubkeyB can still query habr.com
    expect(limiter.canAttest('https://habr.com/job/2', pubkeyB)).toBe(true);
  });
});
