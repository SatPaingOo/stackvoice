import { describe, expect, it } from 'vitest';

import { IntentPlanner, type Plan, type PlannerApp } from '../../../src/application/intent-planner.js';

const library: PlannerApp = {
  id: 'library',
  label: 'Deep-dive library',
  search: true,
  read: true,
  status: true,
};

const markets: PlannerApp = {
  id: 'markets',
  label: 'Market intelligence',
  search: true,
  read: true,
  status: true,
};

const planner = new IntentPlanner();
const apps = [library, markets];

const call = (plan: Plan): { tool: string; args: Record<string, unknown> } => {
  if (plan.kind !== 'call') throw new Error(`expected a call, got: ${plan.spoken}`);
  return plan.call;
};

describe('status intents', () => {
  it.each([
    'is my stack healthy?',
    'is everything ok',
    'did everything run last night',
    'all good?',
  ])('routes "%s" to the global tool', (utterance) => {
    expect(call(planner.plan(utterance, apps)).tool).toBe('stack_status');
  });

  it('routes to one app when that app is named', () => {
    expect(call(planner.plan('did my library run last night?', apps)).tool).toBe('library_status');
  });

  it('recognises an app by a word from its label', () => {
    expect(call(planner.plan('is my market intelligence working?', apps)).tool).toBe('markets_status');
  });

  it('falls back to the global tool when the named app has no status verb', () => {
    const noStatus = [{ ...library, status: false }];

    expect(call(planner.plan('is my library healthy?', noStatus)).tool).toBe('stack_status');
  });
});

describe('search intents', () => {
  it('pulls the subject out of a spoken question', () => {
    expect(call(planner.plan('what did you find about Myanmar in my library?', apps))).toEqual({
      tool: 'library_search',
      args: { query: 'myanmar', limit: 3 },
    });
  });

  it('handles a bare question with no lead-in phrase', () => {
    expect(call(planner.plan('what happened in Myanmar', apps)).args).toEqual({
      query: 'myanmar',
      limit: 3,
    });
  });

  it('keeps a short subject like AI intact', () => {
    expect(call(planner.plan('anything about AI?', apps)).args).toEqual({ query: 'ai', limit: 3 });
  });

  it('strips the app name out of the query', () => {
    const args = call(planner.plan('anything on Iran in my market intelligence?', apps)).args;

    expect(args).toEqual({ query: 'iran', limit: 3 });
  });

  it('targets the app that was named', () => {
    expect(call(planner.plan('anything on Iran in my market intelligence?', apps)).tool).toBe(
      'markets_search',
    );
  });

  it('defaults to the first searchable app when none is named', () => {
    expect(call(planner.plan('anything about gold', apps)).tool).toBe('library_search');
  });

  it('skips an app that cannot be searched when choosing a default', () => {
    const unsearchable = [{ ...library, search: false }, markets];

    expect(call(planner.plan('anything about gold', unsearchable)).tool).toBe('markets_search');
  });

  it('asks for the latest when the question has no subject left', () => {
    expect(call(planner.plan('what is new?', apps)).args).toEqual({ limit: 3 });
  });
});

describe('follow-ups', () => {
  const context = { lastKey: '2026-09-01-003', lastAppId: 'library' };

  it('reads the entry the last answer left behind', () => {
    expect(call(planner.plan('tell me more', apps, context))).toEqual({
      tool: 'library_read',
      args: { key: '2026-09-01-003' },
    });
  });

  it('reads from the app the key belongs to, not the default app', () => {
    const fromMarkets = { lastKey: 'evt-1', lastAppId: 'markets' };

    expect(call(planner.plan('more detail please', apps, fromMarkets)).tool).toBe('markets_read');
  });

  it('treats a follow-up as a search when there is nothing to follow up on', () => {
    expect(call(planner.plan('tell me more', apps)).tool).toBe('library_search');
  });
});

describe('when it cannot help', () => {
  it('says so for an empty utterance', () => {
    const plan = planner.plan('   ', apps);

    expect(plan.kind).toBe('unclear');
  });

  it('says so when no apps are configured', () => {
    const plan = planner.plan('anything about gold', []);

    expect(plan).toEqual({ kind: 'unclear', spoken: 'You have no apps configured yet.' });
  });

  it('suggests the health question when nothing is searchable', () => {
    const plan = planner.plan('anything about gold', [{ ...library, search: false }]);

    if (plan.kind !== 'unclear') throw new Error('expected unclear');
    expect(plan.spoken).toContain('healthy');
  });
});
