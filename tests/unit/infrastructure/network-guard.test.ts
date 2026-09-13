import { describe, expect, it } from 'vitest';

import { SourceUnavailableError } from '../../../src/domain/errors.js';
import { assertFetchable, isPrivateAddress, type Resolver } from '../../../src/infrastructure/http/network-guard.js';

const closed = { allowPrivateNetwork: false };
const open = { allowPrivateNetwork: true };

const resolvesTo =
  (...addresses: string[]): Resolver =>
  async () =>
    addresses;

const mustNotResolve: Resolver = async () => {
  throw new Error('an address literal must not be looked up');
};

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.0.8',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    'not-an-address',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '151.101.1.140',
    '172.32.0.1',
    '192.169.0.1',
    '100.128.0.1',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
  ])('allows %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('assertFetchable', () => {
  it('lets a public address through', async () => {
    await expect(
      assertFetchable('https://feeds.example.org/news.xml', 'news', closed, resolvesTo('151.101.1.140')),
    ).resolves.toBeUndefined();
  });

  it.each([
    'http://127.0.0.1:8765/console/api/settings',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5:9200/_search',
  ])('refuses %s without looking anything up', async (url) => {
    await expect(assertFetchable(url, 'x', closed, mustNotResolve)).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('refuses a name that resolves to a private address, and says how to allow it', async () => {
    await expect(
      assertFetchable('http://metadata.internal/', 'x', closed, resolvesTo('169.254.169.254')),
    ).rejects.toThrowError(/Settings, Data sources/);
  });

  it('refuses when any of several addresses is private', async () => {
    await expect(
      assertFetchable('https://mixed.example/', 'x', closed, resolvesTo('93.184.215.14', '10.0.0.5')),
    ).rejects.toThrowError(/10\.0\.0\.5/);
  });

  it('allows a private address once the owner has turned that on', async () => {
    await expect(
      assertFetchable('http://192.168.1.20:3000/data.json', 'x', open, mustNotResolve),
    ).resolves.toBeUndefined();
  });

  it.each(['ftp://example.org/data.csv', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'refuses %s even when private networks are allowed',
    async (url) => {
      await expect(assertFetchable(url, 'x', open, mustNotResolve)).rejects.toThrowError(/cannot be read/);
    },
  );

  it('reports an unresolvable name as a typed error', async () => {
    const fails: Resolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(assertFetchable('https://nowhere.invalid/', 'x', closed, fails)).rejects.toThrowError(
      /could not resolve/,
    );
  });

  it('reports something that is not an address', async () => {
    await expect(assertFetchable('not a url', 'x', closed, mustNotResolve)).rejects.toThrowError(/not a web address/);
  });
});
