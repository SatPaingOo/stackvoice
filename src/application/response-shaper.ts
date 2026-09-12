import type { StackHealth } from '../domain/health.js';

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
    return toSpoken(`Your stack is healthy. ${healthy.length} apps are running: ${names}.`);
  }

  const names = listPhrase(failing.map((app) => app.appId));
  const trouble = failing.length === 1 ? 'app has a problem' : 'apps have problems';
  return toSpoken(`${failing.length} ${trouble}: ${names}. The other ${healthy.length} are fine.`);
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
