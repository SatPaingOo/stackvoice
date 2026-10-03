import { describe, expect, it } from 'vitest';

import { sameSecret } from '../../../src/infrastructure/auth/secret-compare.js';

describe('sameSecret', () => {
  it('accepts the same secret', () => {
    expect(sameSecret('owner-secret', 'owner-secret')).toBe(true);
  });

  it('refuses a different secret of the same length', () => {
    expect(sameSecret('owner-secret', 'owner-secreT')).toBe(false);
  });

  it('refuses a different length without throwing', () => {
    expect(sameSecret('owner-secret', 'owner')).toBe(false);
    expect(sameSecret('owner-secret', '')).toBe(false);
  });

  it('compares characters outside ASCII', () => {
    expect(sameSecret('ကြယ်-token', 'ကြယ်-token')).toBe(true);
    expect(sameSecret('ကြယ်-token', 'ကြယ-token')).toBe(false);
  });
});
