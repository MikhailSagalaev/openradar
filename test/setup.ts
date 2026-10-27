import { setDnsLookupForTests } from '../src/core/ssrf.ts';

// Unit tests never resolve real hostnames: every name resolves to a public
// documentation address, so adapter tests run offline and deterministically.
// Tests that need a specific answer call setDnsLookupForTests themselves.
setDnsLookupForTests(async () => [{ address: '93.184.215.14', family: 4 }]);
