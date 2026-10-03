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
      trusted_proxies: z.number().int().min(0).max(5).default(0),
    })
    .default({ host: '127.0.0.1', port: 8765, log_level: 'info', trusted_proxies: 0 }),
  management: z
    .object({
      cli: z.boolean().default(true),
    })
    .default({ cli: true }),
  auth: z
    .object({
      mode: z.enum(['none', 'token', 'oauth']).default('none'),
      token: z.string().default(''),
      public_url: z.string().default(''),
    })
    .default({ mode: 'none', token: '', public_url: '' })
    .refine((value) => value.mode !== 'oauth' || value.public_url.startsWith('http'), {
      message: 'auth.public_url is required when auth.mode is "oauth"',
    })
    .refine((value) => value.mode !== 'token' || value.token !== '', {
      message: 'auth.token is required when auth.mode is "token"',
    }),
  console: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
  simulator: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
  sources: z
    .object({
      allow_private_network: z.boolean().default(false),
      data_dir: z.string().min(1).default('data'),
    })
    .default({ allow_private_network: false, data_dir: 'data' }),
  cache: z
    .object({
      ttl_seconds: z.number().int().min(0).max(86_400).default(300),
    })
    .default({ ttl_seconds: 300 }),
});

export type RawSettings = z.infer<typeof settingsSchema>;
