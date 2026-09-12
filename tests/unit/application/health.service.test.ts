import { describe, expect, it } from 'vitest';

import { HealthService, type Clock } from '../../../src/application/health.service.js';

const fixedClock = (iso: string, uptime: number): Clock => ({
  now: () => new Date(iso),
  uptimeSeconds: () => uptime,
});

describe('HealthService.reportStack', () => {
  it('reports the injected version and a rounded uptime', () => {
    const report = new HealthService('1.2.3', fixedClock('2026-09-12T10:00:00.000Z', 61.7)).reportStack();

    expect(report.version).toBe('1.2.3');
    expect(report.uptimeSeconds).toBe(62);
    expect(report.checkedAt).toBe('2026-09-12T10:00:00.000Z');
  });

  it('reports no apps until the registry lands in Stage 2', () => {
    const report = new HealthService('1.2.3', fixedClock('2026-09-12T10:00:00.000Z', 1)).reportStack();

    expect(report.apps).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
