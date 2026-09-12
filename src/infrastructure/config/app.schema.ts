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

const sourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('github-repo'),
  label: z.string().min(1),
  repo: z.string().min(3),
  views_dir: z.string().min(1).default('data/views'),
  stats_file: z.string().min(1).default('data/views/stats.json'),
  index_file: z.string().min(1).optional(),
  /** Dot path to the array inside the index document; omit when it is already an array. */
  items_path: z.string().min(1).nullable().default(null),
  fields: fieldsSchema,
  status_fields: statusFieldsSchema,
});

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
