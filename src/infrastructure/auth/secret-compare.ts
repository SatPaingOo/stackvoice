import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares a submitted secret with the real one in constant time.
 *
 * Both sides are hashed first, so the comparison always runs over 32 bytes and
 * takes the same time whatever the submitted length. Comparing the raw values
 * needs a length check first, and that check answers faster for a wrong length.
 */
export function sameSecret(expected: string, submitted: string): boolean {
  return timingSafeEqual(digest(expected), digest(submitted));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
