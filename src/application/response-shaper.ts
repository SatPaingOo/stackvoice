import type { AppHealth, StackHealth } from '../domain/health.js';
import type { Item, SearchParams } from '../domain/item.js';

/**
 * Turns read models into text a voice assistant can speak.
 *
 * This is P5 and the reason StackVoice is not just another config-driven MCP
 * server: competing servers hand the assistant a JSON payload, which a speaker
 * cannot read aloud. Every tool result passes through here.
 *
 * Rules: lead with the answer, one idea per sentence, no lists longer than
 * three items, no raw timestamps, never more than roughly 45 spoken words.
 */
const MAX_SPOKEN_WORDS = 45;

/** Collapses whitespace and trims a sentence to the spoken-word budget. */
export function toSpoken(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= MAX_SPOKEN_WORDS) return words.join(' ');
  return `${words.slice(0, MAX_SPOKEN_WORDS).join(' ')}…`;
}

/** "2 hours ago", "yesterday" — never an ISO timestamp. */
export function humanizeSince(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Humanises an uptime in seconds: "3 minutes", "2 hours". */
export function humanizeDuration(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

export function shapeStackHealth(health: StackHealth): string {
  if (health.apps.length === 0) {
    return toSpoken(
      `StackVoice is running and has been up for ${humanizeDuration(health.uptimeSeconds)}. No apps are configured yet, so there is nothing to search.`,
    );
  }

  const failing = health.apps.filter((app) => app.enabled && !app.ok);
  const healthy = health.apps.filter((app) => app.enabled && app.ok);

  if (failing.length === 0) {
    const names = listPhrase(healthy.map((app) => app.appId));
    const count = healthy.length === 1 ? '1 app is' : `${healthy.length} apps are`;
    return toSpoken(`Your stack is healthy. ${count} running: ${names}.`);
  }

  const names = listPhrase(failing.map((app) => app.appId));
  const trouble = failing.length === 1 ? 'app has a problem' : 'apps have problems';
  const rest =
    healthy.length === 0 ? '' : ` The other ${healthy.length === 1 ? 'one is' : `${healthy.length} are`} fine.`;
  return toSpoken(`${failing.length} ${trouble}: ${names}.${rest}`);
}

/** "a, b and c" — caps at three, then "and N more". */
export function listPhrase(items: readonly string[]): string {
  if (items.length === 0) return 'none';
  if (items.length === 1) return items[0] as string;
  if (items.length <= 3) {
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
  }
  return `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
}

/**
 * Search results as a spoken answer.
 *
 * A voice assistant cannot read a JSON array aloud, so this is deliberately not
 * a list dump: it says how many there are, then reads the newest few titles.
 */
export function shapeSearchResults(
  appLabel: string,
  items: readonly Item[],
  params: SearchParams,
): string {
  if (items.length === 0) {
    const about = params.query !== undefined && params.query.trim() !== '' ? ` about ${params.query}` : '';
    return toSpoken(`I found nothing${about} in your ${appLabel}.`);
  }

  const lead = items.length === 1 ? 'One entry' : `${items.length} entries`;
  const titles = items.slice(0, 3).map((item) => trimTitle(item.title));
  const more = items.length > 3 ? `, and ${items.length - 3} more` : '';
  return toSpoken(`${lead} in your ${appLabel}. ${listPhrase(titles)}${more}.`);
}

/** One entry, read out: the title, then the summary if it adds anything. */
export function shapeItem(item: Item): string {
  const title = trimTitle(item.title);
  const summary = item.summary === null ? null : item.summary.replace(/\s+/g, ' ').trim();
  // Some apps store one line of text and map both fields to it; do not say it twice.
  if (summary === null || summary === '' || summary.startsWith(title.replace(/…$/, ''))) {
    return toSpoken(title);
  }
  return toSpoken(`${title}. ${summary}`);
}

export function shapeAppHealth(appLabel: string, health: AppHealth, now: Date): string {
  const source = health.sources[0];
  if (source === undefined) return toSpoken(`Your ${appLabel} has no sources configured.`);

  if (!health.ok) {
    return toSpoken(`Your ${appLabel} has a problem: ${source.lastError ?? 'the last run did not succeed'}.`);
  }

  const when = source.lastRunAt === null ? null : humanizeSince(new Date(source.lastRunAt), now);
  const ran = when === null ? '' : ` It last ran ${when}.`;
  const holds = source.itemCount === null ? '' : ` It holds ${source.itemCount} items`;
  const fresh = source.lastDataDate === null ? '' : `${holds === '' ? ' Data is' : ', fresh to'} ${describeDate(source.lastDataDate)}`;
  return toSpoken(`Your ${appLabel} is healthy.${ran}${holds}${fresh}${holds === '' && fresh === '' ? '' : '.'}`);
}

/** Turns an ISO-ish date into something speakable, without reading digits aloud. */
function describeDate(value: string): string {
  const date = value.length >= 10 ? value.slice(0, 10) : value;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Titles from news feeds run long and some already end in a full stop. Both
 * matter out loud: a long title buries the point, and a stray period turns a
 * read-back list into "Ecuador., President Trump...".
 */
function trimTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return clean.length <= 90 ? clean : `${clean.slice(0, 87).trimEnd()}…`;
}
