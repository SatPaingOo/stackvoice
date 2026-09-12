import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { SourceUnavailableError } from '../../domain/errors.js';

export interface NetworkPolicy {
  /** Off by default. A self-hoster pointing at a server on their own network turns it on. */
  readonly allowPrivateNetwork: boolean;
}

export type Resolver = (hostname: string) => Promise<readonly string[]>;

const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * Refuses to fetch an address inside a private network unless the owner has said
 * that is intended.
 *
 * Without this, a console reachable from the internet is a way to make the
 * server fetch its own cloud metadata endpoint (169.254.169.254), or anything on
 * the network it sits in, and read the answer back through an app.
 *
 * Every address a name resolves to is checked, not only the first, and the HTTP
 * client calls this again for every redirect, so a public address cannot simply
 * redirect to a private one.
 */
export async function assertFetchable(
  rawUrl: string,
  sourceId: string,
  policy: NetworkPolicy,
  resolve: Resolver = systemResolver,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceUnavailableError(sourceId, `"${rawUrl}" is not a web address`);
  }

  // Checked even when private networks are allowed: file: and friends are never web sources.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceUnavailableError(sourceId, `${url.protocol} addresses cannot be read`);
  }
  if (policy.allowPrivateNetwork) return;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: readonly string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch (cause) {
      throw new SourceUnavailableError(sourceId, `could not resolve ${host}`, { cause });
    }
  }

  const blocked = addresses.find(isPrivateAddress);
  if (blocked !== undefined) {
    throw new SourceUnavailableError(
      sourceId,
      `${host} points at a private network address (${blocked}). If that is your own server, turn on private network access under Settings, Data sources.`,
    );
  }
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and reserved addresses. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateV4(address);
  if (version === 6) return isPrivateV6(address);
  // Not an address at all. Refuse rather than guess.
  return true;
}

function isPrivateV4(address: string): boolean {
  const [a, b, c] = address.split('.').map(Number) as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateV6(address: string): boolean {
  const groups = expandIPv6(address);
  // An address the parser accepted but this cannot expand is not worth guessing about.
  if (groups === null) return true;

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // :: (unspecified) and ::1 (loopback)
  if (zeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true;

  // ::ffff:a.b.c.d is an IPv4 address in disguise. The URL parser even rewrites
  // [::ffff:127.0.0.1] as [::ffff:7f00:1], so it is judged by the IPv4 it holds.
  if (zeroPrefix && g5 === 0xffff) {
    return isPrivateV4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
  }

  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (g0 & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (g0 & 0xff00) === 0xff00 // multicast ff00::/8
  );
}

/**
 * The eight 16-bit groups of an IPv6 address, with `::` expanded and a trailing
 * dotted IPv4 part converted. Parsing beats pattern-matching here: every
 * shorthand form of the same address has to land on the same answer.
 */
function expandIPv6(address: string): number[] | null {
  let text = (address.toLowerCase().split('%')[0] ?? '').trim();

  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted !== null) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((octet) => octet > 255)) return null;
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;

  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN,
  );
  return groups.length === 8 && groups.every((group) => !Number.isNaN(group)) ? groups : null;
}
