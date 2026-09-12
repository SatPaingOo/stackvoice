import { uptime } from 'node:process';

import type { Clock } from '../application/health.service.js';

/** The real clock. Tests inject a fake instead. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  uptimeSeconds(): number {
    return uptime();
  }
}
