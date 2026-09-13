/**
 * Turns something a person said into a tool call.
 *
 * On a real Alexa+ device this is the assistant's job — StackVoice only
 * supplies the tools. The simulator has no assistant behind it, so this stands
 * in for that step: deterministic, offline, and free, which also makes the demo
 * reproducible rather than dependent on a model's mood.
 *
 * It is deliberately a pure function over the configured apps: add an app to
 * `config/apps/` and it becomes addressable by voice with no change here.
 */
export interface PlannerApp {
  readonly id: string;
  readonly label: string;
  readonly search: boolean;
  readonly read: boolean;
  readonly status: boolean;
}

/** A shortcut the planner can route to, flattened to what matching needs. */
export interface PlannerShortcut {
  readonly toolName: string;
  /** Phrases to listen for. `{topic}` in one captures whatever was said in its place. */
  readonly phrases: readonly string[];
}

export interface PlannedCall {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface PlannerContext {
  /** The entry the last search surfaced, so "tell me more" has something to read. */
  readonly lastKey?: string | undefined;
  readonly lastAppId?: string | undefined;
}

export type Plan =
  | { readonly kind: 'call'; readonly call: PlannedCall; readonly appId: string | null }
  | { readonly kind: 'unclear'; readonly spoken: string };

const STATUS_WORDS = [
  'status',
  'healthy',
  'health',
  'working',
  'broken',
  'ok',
  'okay',
  'up to date',
  'running',
  'ran',
  'run',
  'last night',
  'everything fine',
  'all good',
];

const FOLLOW_UP_WORDS = ['more', 'detail', 'details', 'full', 'whole thing', 'expand', 'go on', 'read it'];

/** Phrases people put in front of the thing they actually want. */
const LEAD_INS = [
  'what happened in',
  'what happened with',
  'what did you find out about',
  'what did you find about',
  'what have you got on',
  'what do you have on',
  'what is new in',
  "what's new in",
  'anything new about',
  'anything about',
  'anything on',
  'tell me about',
  'search for',
  'search my',
  'search',
  'look up',
  'look for',
  'find me',
  'find',
  'show me',
  'show',
  'check',
  'ask',
];

/**
 * Words that carry no subject. Spoken questions are full of them, and leaving
 * them in the query makes the search look for articles about the word "what".
 */
const FILLER = [
  'please',
  'hey',
  'alexa',
  'stackvoice',
  'my',
  'your',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'at',
  'to',
  'about',
  'for',
  'me',
  'i',
  'what',
  'whats',
  'which',
  'who',
  'where',
  'when',
  'why',
  'how',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'there',
  'any',
  'anything',
  'something',
  'stuff',
  'thing',
  'things',
  'happened',
  'happening',
  'going',
  'new',
  'latest',
  'recent',
  'recently',
  'tell',
  'say',
  'know',
  'get',
  'got',
  'give',
];

export class IntentPlanner {
  plan(
    utterance: string,
    apps: readonly PlannerApp[],
    context: PlannerContext = {},
    shortcuts: readonly PlannerShortcut[] = [],
  ): Plan {
    const text = normalize(utterance);
    if (text === '') {
      return { kind: 'unclear', spoken: 'I did not catch that.' };
    }
    if (apps.length === 0) {
      return { kind: 'unclear', spoken: 'You have no apps configured yet.' };
    }

    // Shortcuts win over everything: a person who named one asked for exactly
    // it, and "morning brief" would otherwise be searched for as a subject.
    // Matched against the words as spoken, so a slot keeps its capitals: "OpenAI", not "openai".
    const shortcut = matchShortcut(clean(utterance), shortcuts);
    if (shortcut !== null) {
      return { kind: 'call', call: { tool: shortcut.toolName, args: shortcut.args }, appId: null };
    }

    const named = this.resolveApp(text, apps);

    // "Tell me more" only means something when a previous answer left a key behind.
    if (context.lastKey !== undefined && containsAny(text, FOLLOW_UP_WORDS)) {
      const app = apps.find((candidate) => candidate.id === context.lastAppId);
      if (app !== undefined && app.read) {
        return {
          kind: 'call',
          call: { tool: `${app.id}_read`, args: { key: context.lastKey } },
          appId: app.id,
        };
      }
    }

    if (containsAny(text, STATUS_WORDS)) {
      if (named !== null && named.status) {
        return { kind: 'call', call: { tool: `${named.id}_status`, args: {} }, appId: named.id };
      }
      return { kind: 'call', call: { tool: 'stack_status', args: {} }, appId: null };
    }

    const target = named !== null && named.search ? named : apps.find((app) => app.search);
    if (target === undefined) {
      return {
        kind: 'unclear',
        spoken: 'None of your apps can be searched. Ask me whether your stack is healthy instead.',
      };
    }

    const query = extractQuery(text, apps);
    return {
      kind: 'call',
      call: {
        tool: `${target.id}_search`,
        args: query === '' ? { limit: 3 } : { query, limit: 3 },
      },
      appId: target.id,
    };
  }

  /** Matches an app by its id or by any distinctive word in its label. */
  private resolveApp(text: string, apps: readonly PlannerApp[]): PlannerApp | null {
    for (const app of apps) {
      if (text.includes(app.id)) return app;
      const words = normalize(app.label)
        .split(' ')
        .filter((word) => word.length > 3);
      if (words.some((word) => text.includes(word))) return app;
    }
    return null;
  }
}

/** Small words speech puts around a value, dropped from its edges: "the gold price please" is "gold price". */
const EDGE_WORDS = new Set([...FILLER, 'please', 'thanks', 'thank', 'you', 's', 'some', 'now', 'today']);

/**
 * Matches a shortcut by one of its phrases.
 *
 * Every word of the phrase must be said, in order, as whole words: a shortcut
 * listening for "news brief" must not swallow "what's the news about Iran".
 * A slot takes the words said where it sits. Speech adds small words, so "my
 * morning brief please" still matches, and a slot left with nothing after they
 * are dropped is no match at all.
 */
function matchShortcut(
  spoken: string,
  shortcuts: readonly PlannerShortcut[],
): { toolName: string; args: Record<string, string> } | null {
  let best: { toolName: string; args: Record<string, string>; score: number } | null = null;
  for (const shortcut of shortcuts) {
    for (const phrase of shortcut.phrases) {
      const match = matchPhrase(spoken, phrase);
      // The phrase with the most words in it wins, so "morning brief" beats "brief".
      if (match !== null && (best === null || match.score > best.score)) {
        best = { toolName: shortcut.toolName, args: match.args, score: match.score };
      }
    }
  }
  return best === null ? null : { toolName: best.toolName, args: best.args };
}

function matchPhrase(spoken: string, phrase: string): { args: Record<string, string>; score: number } | null {
  const tokens = phrase
    .split(/(\{[a-z][a-z0-9_]*\})/)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  const slots: string[] = [];
  let pattern = '';
  let score = 0;

  tokens.forEach((token, index) => {
    const first = index === 0;
    const last = index === tokens.length - 1;
    const slot = /^\{([a-z][a-z0-9_]*)\}$/.exec(token);

    if (slot !== null) {
      slots.push(slot[1] as string);
      // A slot at the end takes everything after the words before it.
      pattern += `${first ? '^' : '\\s+'}(.+${last ? '' : '?'})${last ? '$' : ''}`;
      return;
    }

    const words = normalize(token);
    if (words === '') return;
    score += words.length;
    pattern += `${first ? '(?:^|\\s)' : '\\s+'}${escapeRegExp(words).replace(/ /g, '\\s+')}${last ? '(?=\\s|$)' : ''}`;
  });

  if (score === 0) return null;
  const match = new RegExp(pattern, 'iu').exec(spoken);
  if (match === null) return null;

  const args: Record<string, string> = {};
  for (const [index, slot] of slots.entries()) {
    const value = trimEdges(match[index + 1] ?? '');
    if (value === '') return null;
    args[slot] = value;
  }
  return { args, score };
}

function trimEdges(value: string): string {
  const words = value.split(' ').filter((word) => word !== '');
  while (words.length > 0 && EDGE_WORDS.has((words[0] as string).toLowerCase())) words.shift();
  while (words.length > 0 && EDGE_WORDS.has((words[words.length - 1] as string).toLowerCase())) words.pop();
  return words.join(' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text: string): string {
  return clean(text).toLowerCase();
}

/** Punctuation out and single spaces, with the case left as it was said. */
function clean(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) =>
    needle.includes(' ') ? text.includes(needle) : new RegExp(`\\b${needle}\\b`).test(text),
  );
}

/** Strips the lead-in, the app name and filler, leaving the subject. */
function extractQuery(text: string, apps: readonly PlannerApp[]): string {
  let rest = text;

  for (const lead of LEAD_INS) {
    const at = rest.indexOf(lead);
    if (at !== -1) {
      rest = rest.slice(at + lead.length);
      break;
    }
  }

  for (const app of apps) {
    rest = rest.replace(new RegExp(`\\b${app.id}\\b`, 'g'), ' ');
    for (const word of normalize(app.label).split(' ')) {
      if (word.length > 3) rest = rest.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
    }
  }

  return rest
    .split(' ')
    .filter((word) => word !== '' && !FILLER.includes(word))
    .join(' ')
    .trim();
}
