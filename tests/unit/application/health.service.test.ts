import { describe, expect, it } from 'vitest';

import { AppRegistryService } from '../../../src/application/app-registry.service.js';
import { HealthService, type Clock } from '../../../src/application/health.service.js';
import { StatusService } from '../../../src/application/status.service.js';
import { AppDefinition } from '../../../src/domain/app-definition.js';
import { DataSource, DEFAULT_FIELD_MAP, DEFAULT_STATUS_FIELD_MAP } from '../../../src/domain/data-source.js';
import type { SourceHealth } from '../../../src/domain/health.js';
import type { ConfigStore } from '../../../src/domain/ports/config-store.js';
import type { DataSourceReader, DataSourceReaderFactory } from '../../../src/domain/ports/data-source-reader.js';
import type { Logger } from '../../../src/domain/ports/logger.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const fixedClock = (iso: string, uptime: number): Clock => ({
  now: () => new Date(iso),
  uptimeSeconds: () => uptime,
});

const source = (id: string) =>
  new DataSource({
    id,
    type: 'github-repo',
    label: id,
    repo: 'owner/repo',
    viewsDir: 'data/views',
    statsFile: 'data/views/stats.json',
    indexFile: 'data/views/index.json',
    itemsPath: null,
    fields: DEFAULT_FIELD_MAP,
    statusFields: DEFAULT_STATUS_FIELD_MAP,
  });

const app = (id: string, enabled = true) =>
  new AppDefinition({
    id,
    label: id,
    description: 'd',
    enabled,
    primitives: { search: true, read: true, status: true },
    sources: [source(id)],
  });

/** In-memory ConfigStore — the registry never touches a filesystem in these tests. */
const storeOf = (apps: AppDefinition[]): ConfigStore => ({ listApps: async () => apps });

/** Every source reports the health the map says, so aggregation is the thing under test. */
const readersReporting = (byId: Record<string, boolean>): DataSourceReaderFactory => {
  const reader: DataSourceReader = {
    search: async () => [],
    read: async () => null,
    status: async (src): Promise<SourceHealth> => ({
      sourceId: src.id,
      ok: byId[src.id] ?? true,
      lastRunAt: null,
      lastDataDate: null,
      itemCount: null,
      latencyMs: 1,
      lastError: byId[src.id] === false ? 'last run failure' : null,
    }),
  };
  return { forSource: () => reader };
};

const buildHealth = async (apps: AppDefinition[], reporting: Record<string, boolean> = {}) => {
  const registry = new AppRegistryService(storeOf(apps), silentLogger);
  await registry.load();
  const readers = readersReporting(reporting);
  const status = new StatusService(registry, readers);
  return new HealthService('1.2.3', fixedClock('2026-09-12T10:00:00.000Z', 61.7), registry, status);
};

describe('HealthService.reportStack', () => {
  it('reports the injected version and a rounded uptime', async () => {
    const report = await (await buildHealth([])).reportStack();

    expect(report.version).toBe('1.2.3');
    expect(report.uptimeSeconds).toBe(62);
    expect(report.checkedAt).toBe('2026-09-12T10:00:00.000Z');
  });

  it('is healthy with no apps configured', async () => {
    const report = await (await buildHealth([])).reportStack();

    expect(report.apps).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('aggregates every enabled app', async () => {
    const report = await (await buildHealth([app('library'), app('markets')])).reportStack();

    expect(report.apps.map((a) => a.appId)).toEqual(['library', 'markets']);
    expect(report.ok).toBe(true);
  });

  it('skips disabled apps', async () => {
    const report = await (await buildHealth([app('library'), app('hidden', false)])).reportStack();

    expect(report.apps.map((a) => a.appId)).toEqual(['library']);
  });

  it('is unhealthy when any app is unhealthy', async () => {
    const report = await (await buildHealth([app('library'), app('markets')], { markets: false })).reportStack();

    expect(report.ok).toBe(false);
    expect(report.apps.find((a) => a.appId === 'markets')?.ok).toBe(false);
  });
});

describe('AppRegistryService.get', () => {
  it('refuses a disabled app the same way as an unknown one', async () => {
    const registry = new AppRegistryService(storeOf([app('hidden', false)]), silentLogger);
    await registry.load();

    expect(() => registry.get('hidden')).toThrowError(/No app is configured/);
    expect(() => registry.get('nope')).toThrowError(/No app is configured/);
  });
});
