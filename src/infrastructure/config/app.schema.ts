import { z } from 'zod';

import { APP_ID_PATTERN } from '../../domain/app-definition.js';

const fieldsSchema = z
  .object({
    key: z.string().min(1).default('key'),
    title: z.string().min(1).default('title'),
    summary: z.string().min(1).nullable().default('summary'),
    date: z.string().min(1).nullable().default('date'),
    topic: z.string().min(1).nullable().default('topic'),
    region: z.string().min(1).nullable().default('region'),
    url: z.string().min(1).nullable().default('url'),
  })
  .default({ key: 'key', title: 'title', summary: 'summary', date: 'date', topic: 'topic', region: 'region', url: 'url' });

const statusFieldsSchema = z
  .object({
    last_data_date: z.string().min(1).default('last_date'),
    item_count: z.string().min(1).default('total_items'),
  })
  .default({ last_data_date: 'last_date', item_count: 'total_items' });

const formatSchema = z.enum(['json', 'rss', 'atom', 'csv']);

/** What every source has, whatever it reads from. */
const common = {
  id: z.string().min(1),
  label: z.string().min(1),
  /** Dot path to the list inside the document; omit when the document is already the list. */
  items_path: z.string().min(1).nullable().default(null),
  fields: fieldsSchema,
  status_fields: statusFieldsSchema,
};

const githubSource = z.object({
  ...common,
  type: z.literal('github-repo'),
  repo: z.string().min(3),
  branch: z.string().min(1).default('main'),
  views_dir: z.string().min(1).default('data/views'),
  stats_file: z.string().min(1).default('data/views/stats.json'),
  index_file: z.string().min(1).optional(),
});

const urlSource = z.object({
  ...common,
  type: z.literal('url'),
  url: z.string().min(1),
  format: formatSchema,
  /** Values may reference secrets as {{secret:NAME}}; the values themselves live in config/secrets.yml. */
  headers: z.record(z.string(), z.string()).default({}),
});

const fileSource = z.object({
  ...common,
  type: z.literal('file'),
  /** Relative to sources.data_dir in settings. */
  path: z.string().min(1),
  format: formatSchema,
});

const sourceSchema = z.discriminatedUnion('type', [githubSource, urlSource, fileSource]);

export const appSchema = z.object({
  id: z.string().regex(APP_ID_PATTERN, 'must be lowercase a-z, 0-9 or "-", 2-32 characters, starting with a letter'),
  label: z.string().min(1),
  description: z.string().min(1),
  enabled: z.boolean().default(true),
  primitives: z
    .object({
      search: z.boolean().default(false),
      read: z.boolean().default(false),
      status: z.boolean().default(false),
    })
    .default({ search: false, read: false, status: false }),
  sources: z.array(sourceSchema).min(1),
  /**
   * Shortcuts moved to `config/shortcuts.yml` because they span apps. An empty
   * list is still accepted so older files keep loading; a populated one is
   * rejected rather than silently ignored.
   */
  shortcuts: z
    .array(z.unknown())
    .max(0, 'shortcuts now live in config/shortcuts.yml, not in an app file')
    .default([]),
});

export type RawApp = z.infer<typeof appSchema>;
export type RawSource = z.infer<typeof sourceSchema>;
