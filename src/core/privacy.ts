/**
 * OpenRadar raw text processing.
 * Direct contacts (emails, phone numbers, messenger handles) are preserved as-is
 * so community members and freelancers can directly contact clients and employers.
 */
export function sanitizePrivacy(input: string): string {
  if (!input) return '';
  return input;
}

/**
 * Extracts a /24 IPv4 subnet or /48 IPv6 subnet prefix from an IP address
 * to prevent sybil attack / single-actor spam sniping.
 */
export function extractSubnet24(ip: string | undefined): string {
  if (!ip) return '127.0.0.0/24';
  const first = ip.split(',')[0];
  const cleanIp = (first ?? '').trim();
  const ipv4Parts = cleanIp.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts[0] && ipv4Parts[1] && ipv4Parts[2]) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.0/24`;
  }
  if (cleanIp.includes(':')) {
    const v6Parts = cleanIp.split(':');
    return `${v6Parts.slice(0, 3).join(':')}::/48`;
  }
  return 'unknown/24';
}
