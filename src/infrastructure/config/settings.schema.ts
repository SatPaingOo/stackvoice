import { z } from 'zod';

/**
 * zod lives at the boundary only. This schema is the single source of truth for
 * the shape of `config/settings.yml`; the domain consumes the parsed result as
 * a plain `Settings`.
 */
export const settingsSchema = z.object({
  server: z
    .object({
      host: z.string().min(1).default('127.0.0.1'),
      port: z.number().int().min(1).max(65535).default(8765),
      log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .default({ host: '127.0.0.1', port: 8765, log_level: 'info' }),
  management: z
    .object({
      cli: z.boolean().default(true),
      auth_token: z.string().default(''),
    })
    .default({ cli: true, auth_token: '' }),
  cache: z
    .object({
      ttl_seconds: z.number().int().min(0).max(86_400).default(300),
    })
    .default({ ttl_seconds: 300 }),
});

export type RawSettings = z.infer<typeof settingsSchema>;
