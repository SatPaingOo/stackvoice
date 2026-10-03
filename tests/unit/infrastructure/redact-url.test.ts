import { describe, expect, it } from 'vitest';

import { redactUrl } from '../../../src/infrastructure/http/redact-url.js';

describe('redactUrl', () => {
  it('leaves an address without a query string as it is', () => {
    expect(redactUrl('https://feeds.example.org/news/rss.xml')).toBe('https://feeds.example.org/news/rss.xml');
  });

  it('keeps the names in a query string and hides every value', () => {
    expect(redactUrl('https://api.example.com/v1?key=sk-123&page=2')).toBe('https://api.example.com/v1?key=…&page=…');
  });

  it('hides a value whatever its name is', () => {
    expect(redactUrl('https://api.example.com/v1?k=sk-123')).not.toContain('sk-123');
  });

  it('drops a fragment', () => {
    expect(redactUrl('https://example.org/a?x=1#token=abc')).toBe('https://example.org/a?x=…');
  });

  it('never repeats an address it cannot read', () => {
    expect(redactUrl('not a url ?key=sk-123')).toBe('an address that could not be read');
  });
});
