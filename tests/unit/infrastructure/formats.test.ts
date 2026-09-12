import { describe, expect, it } from 'vitest';

import { detectDelimiter, detectFormat } from '../../../src/infrastructure/formats/detect.js';
import {
  isoDate,
  parseBody,
  ParseError,
  stripHtml,
  type FeedDocument,
} from '../../../src/infrastructure/formats/parse.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>BBC News</title>
    <link>https://www.bbc.co.uk/news</link>
    <lastBuildDate>Sat, 13 Sep 2026 10:00:00 GMT</lastBuildDate>
    <item>
      <title><![CDATA[Strike on Myanmar monastery]]></title>
      <description><![CDATA[<p>Fourteen people were <b>killed</b>.</p>]]></description>
      <link>https://www.bbc.co.uk/news/articles/one</link>
      <guid isPermaLink="false">https://www.bbc.co.uk/news/articles/one#0</guid>
      <pubDate>Sat, 13 Sep 2026 09:30:00 GMT</pubDate>
      <category>Asia</category>
    </item>
    <item>
      <title>Second &amp; last</title>
      <description>Plain text</description>
      <link>https://www.bbc.co.uk/news/articles/two</link>
      <pubDate>Fri, 12 Sep 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const RSS_ONE_ITEM = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Solo</title>
  <item><title>Only story</title><link>https://example.org/only</link></item>
</channel></rss>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.org/"><title>Example</title><link>https://example.org/</link></channel>
  <item rdf:about="https://example.org/a"><title>First</title><link>https://example.org/a</link><dc:date>2026-09-10T12:00:00Z</dc:date></item>
</rdf:RDF>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from node</title>
  <updated>2026-09-12T10:00:00Z</updated>
  <link rel="alternate" type="text/html" href="https://github.com/nodejs/node/releases"/>
  <entry>
    <id>tag:github.com,2008:Repository/27193779/v24.8.0</id>
    <updated>2026-09-11T18:00:00Z</updated>
    <link rel="self" href="https://api.example/entry"/>
    <link rel="alternate" type="text/html" href="https://github.com/nodejs/node/releases/tag/v24.8.0"/>
    <title type="html">2026-09-11, Version 24.8.0 (Current)</title>
    <content type="html">&lt;h2&gt;Notable changes&lt;/h2&gt;&lt;p&gt;Faster startup.&lt;/p&gt;</content>
    <author><name>RafaelGSS</name></author>
    <category term="release"/>
  </entry>
</feed>`;

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en"><head><title>Home</title></head><body><p>Hello</p></body></html>`;

describe('detectFormat', () => {
  it.each([
    ['a JSON array', '[{"a":1}]', null, 'json'],
    ['a JSON object after whitespace', '  \n{"items":[]}', null, 'json'],
    ['JSON a server labelled as HTML', '{"a":1}', 'text/html', 'json'],
    ['an RSS 2.0 feed', RSS, 'text/xml', 'rss'],
    ['an RSS 1.0 feed', RDF, null, 'rss'],
    ['an Atom feed', ATOM, 'application/atom+xml', 'atom'],
    ['CSV served as text/plain', 'Date,Price\n1833-01,18.93\n1833-02,19.10\n', 'text/plain', 'csv'],
    ['CSV with a quoted delimiter', 'name,notes\n"Smith, Jane",hello\n', null, 'csv'],
    ['semicolon CSV', 'city;country\nParis;France\nLima;Peru\n', null, 'csv'],
    ['CSV starting with a byte order mark', '﻿name,code\nAfghanistan,AF\n', null, 'csv'],
  ])('reads %s', (_name, body, contentType, expected) => {
    expect(detectFormat(body, contentType)).toBe(expected);
  });

  it.each([
    ['an HTML page', HTML_PAGE],
    ['a bare html tag', '<html lang="en"><body>x</body></html>'],
    ['XML that is not a feed', '<note><to>you</to></note>'],
    ['prose', 'Hello there.\nThis is just text.'],
    ['a single CSV line with no rows', 'a,b,c'],
    ['an empty body', '   '],
  ])('refuses %s', (_name, body) => {
    expect(detectFormat(body, 'text/plain')).toBeNull();
  });

  it('trusts a CSV content type when the bytes cannot decide', () => {
    expect(detectFormat('name\nAfghanistan\n', 'text/csv')).toBe('csv');
  });

  it('does not let a cut-off last line veto a long CSV', () => {
    const rows = Array.from({ length: 400 }, (_, i) => `row ${i},${i * 2},"note, ${i}"`).join('\n');
    const body = `label,value,note\n${rows}`;
    expect(body.length).toBeGreaterThan(4096);
    expect(detectFormat(body, 'text/plain')).toBe('csv');
  });
});

describe('detectDelimiter', () => {
  it.each([
    ['a,b,c', ','],
    ['a;b;c', ';'],
    ['a\tb\tc', '\t'],
    ['just one column', null],
  ])('finds the delimiter in %j', (line, expected) => {
    expect(detectDelimiter(line)).toBe(expected);
  });
});

describe('parseBody: RSS', () => {
  const feed = parseBody(RSS, 'rss') as FeedDocument;

  it('reads every item', () => {
    expect(feed.items).toHaveLength(2);
  });

  it('strips HTML and CDATA from titles and summaries', () => {
    expect(feed.items[0]?.title).toBe('Strike on Myanmar monastery');
    expect(feed.items[0]?.summary).toBe('Fourteen people were killed.');
  });

  it('decodes entities in plain elements', () => {
    expect(feed.items[1]?.title).toBe('Second & last');
  });

  it('makes dates ISO so feeds sort by time, not by weekday', () => {
    expect(feed.items[0]?.date).toBe('2026-09-13T09:30:00.000Z');
    expect(feed.channel.updated).toBe('2026-09-13T10:00:00.000Z');
  });

  it('uses the guid as the id, falling back to the link', () => {
    expect(feed.items[0]?.id).toBe('https://www.bbc.co.uk/news/articles/one#0');
    expect(feed.items[1]?.id).toBe('https://www.bbc.co.uk/news/articles/two');
  });

  it('keeps the category and the channel title', () => {
    expect(feed.items[0]?.category).toBe('Asia');
    expect(feed.channel.title).toBe('BBC News');
  });

  it('reads a feed with a single item as a list of one', () => {
    const solo = parseBody(RSS_ONE_ITEM, 'rss') as FeedDocument;
    expect(solo.items).toHaveLength(1);
    expect(solo.items[0]?.title).toBe('Only story');
  });

  it('reads RSS 1.0, where items sit beside the channel', () => {
    const rdf = parseBody(RDF, 'rss') as FeedDocument;
    expect(rdf.items[0]).toMatchObject({ title: 'First', date: '2026-09-10T12:00:00.000Z' });
  });

  it('refuses a document that declares its own entities', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><rss><channel><item><title>&b;</title></item></channel></rss>';
    expect(() => parseBody(bomb, 'rss')).toThrowError(/entities/);
  });

  it('refuses XML that is not a feed', () => {
    expect(() => parseBody('<note><to>you</to></note>', 'rss')).toThrowError(ParseError);
  });
});

describe('parseBody: Atom', () => {
  const feed = parseBody(ATOM, 'atom') as FeedDocument;
  const entry = feed.items[0];

  it('uses the alternate link rather than the self link', () => {
    expect(entry?.link).toBe('https://github.com/nodejs/node/releases/tag/v24.8.0');
  });

  it('reads a typed title and escaped HTML content as plain text', () => {
    expect(entry?.title).toBe('2026-09-11, Version 24.8.0 (Current)');
    expect(entry?.summary).toBe('Notable changes Faster startup.');
  });

  it('reads the author name, the category term and the date', () => {
    expect(entry).toMatchObject({
      author: 'RafaelGSS',
      category: 'release',
      date: '2026-09-11T18:00:00.000Z',
      id: 'tag:github.com,2008:Repository/27193779/v24.8.0',
    });
  });

  it('refuses RSS handed to the Atom parser', () => {
    expect(() => parseBody(RSS, 'atom')).toThrowError(/not an Atom feed/);
  });
});

describe('parseBody: CSV', () => {
  it('turns rows into records keyed by the header', () => {
    expect(parseBody('Date,Price\n1833-01,18.930\n1833-02,19.100\n', 'csv')).toEqual([
      { Date: '1833-01', Price: '18.930' },
      { Date: '1833-02', Price: '19.100' },
    ]);
  });

  it('handles quotes, escaped quotes and a byte order mark', () => {
    expect(parseBody('﻿name,notes\n"Smith, Jane","said ""hi"""\n', 'csv')).toEqual([
      { name: 'Smith, Jane', notes: 'said "hi"' },
    ]);
  });

  it('detects a semicolon delimiter', () => {
    expect(parseBody('city;country\nParis;France\n', 'csv')).toEqual([{ city: 'Paris', country: 'France' }]);
  });

  it('names a blank header cell rather than dropping its column', () => {
    expect(parseBody('name,\nAda,1815\n', 'csv')).toEqual([{ name: 'Ada', column2: '1815' }]);
  });
});

describe('parseBody: JSON', () => {
  it('parses JSON, ignoring a byte order mark', () => {
    expect(parseBody('﻿[{"a":1}]', 'json')).toEqual([{ a: 1 }]);
  });

  it('reports invalid JSON as a ParseError', () => {
    expect(() => parseBody('{"a":', 'json')).toThrowError(ParseError);
  });
});

describe('stripHtml and isoDate', () => {
  it('removes scripts entirely, not just their tags', () => {
    expect(stripHtml('<p>Hi</p><script>alert(1)</script>')).toBe('Hi');
  });

  it('decodes numeric entities', () => {
    expect(stripHtml('caf&#233;')).toBe('café');
  });

  it('turns an empty result into null', () => {
    expect(stripHtml('<br/>')).toBeNull();
  });

  it('makes a readable date ISO', () => {
    expect(isoDate('Sat, 13 Sep 2026 09:30:00 GMT')).toBe('2026-09-13T09:30:00.000Z');
  });

  it('leaves a value that is not a date untouched', () => {
    expect(isoDate('not a date')).toBe('not a date');
  });
});
