import type { AppDefinition } from '../domain/app-definition.js';
import type { Shortcut } from '../domain/shortcut.js';
import type { ToolSpec } from '../domain/tool-spec.js';

/**
 * Turns app config into the tools to expose. This is the config→tools brain,
 * and it is a pure function over the domain: no I/O, no SDK, trivially testable.
 *
 * Tool descriptions are generated from each app's own label and description,
 * because the description is how the assistant decides *when* to call a tool.
 */
export class ToolCatalogService {
  generate(apps: readonly AppDefinition[], shortcuts: readonly Shortcut[] = []): readonly ToolSpec[] {
    const specs: ToolSpec[] = [
      {
        name: 'stack_status',
        title: 'Stack status',
        description:
          'Report whether the user\'s own data stack is healthy: which apps are configured, whether their most recent runs succeeded, and how fresh the data is. Use when the user asks about the state of their stack, for example "is everything running?" or "did my pipelines work last night?".',
        verb: 'stack_status',
        appId: null,
        shortcutName: null,
        slots: [],
        phrases: [],
      },
    ];

    const enabled = apps.filter((candidate) => candidate.enabled);
    if (enabled.length > 0) specs.push(whatsNewSpec(enabled));

    for (const app of enabled) {
      for (const verb of app.enabledVerbs()) {
        specs.push(this.specFor(app, verb));
      }
    }

    // Shortcuts come last so a shortcut can never shadow a generated tool: the
    // MCP layer registers in order and an app's own tools are the ground truth.
    const taken = new Set(specs.map((spec) => spec.name));
    for (const shortcut of shortcuts.filter((candidate) => candidate.enabled)) {
      if (taken.has(shortcut.toolName)) continue;
      taken.add(shortcut.toolName);
      const tools = shortcut.requiredTools();
      const runs = tools.length === 0 ? '' : ` Runs ${listTools(tools)} and answers in one go.`;
      const inputs =
        shortcut.slots.length === 0
          ? ''
          : ` Fill ${listTools(shortcut.slots)} with the words the user said in their place.`;
      specs.push({
        name: shortcut.toolName,
        title: titleCase(shortcut.name),
        description:
          `${shortcut.description}${runs} Use when the user says ${orPhrases(shortcut.phrases())}.${inputs}`.trim(),
        verb: 'shortcut',
        appId: null,
        shortcutName: shortcut.name,
        slots: shortcut.slots,
        phrases: shortcut.phrases(),
      });
    }

    return specs;
  }

  private specFor(app: AppDefinition, verb: 'search' | 'read' | 'status'): ToolSpec {
    const what = app.description.replace(/\s+/g, ' ').trim();

    if (verb === 'search') {
      return {
        name: `${app.id}_search`,
        title: `Search ${app.label}`,
        description: `Search the user's own "${app.label}". ${what} Use when the user asks what their ${app.label} has on a subject, or what it found recently. Returns the most recent matching entries, newest first.`,
        verb,
        appId: app.id,
        shortcutName: null,
        slots: [],
        phrases: [],
      };
    }

    if (verb === 'read') {
      return {
        name: `${app.id}_read`,
        title: `Read from ${app.label}`,
        description: `Read one full entry from the user's own "${app.label}" by its key. ${what} Use after a search, when the user asks for the detail of a specific entry.`,
        verb,
        appId: app.id,
        shortcutName: null,
        slots: [],
        phrases: [],
      };
    }

    return {
      name: `${app.id}_status`,
      title: `${app.label} status`,
      description: `Report the health of the user's "${app.label}": whether its most recent run succeeded, how fresh its data is, and how much it holds. ${what} Use when the user asks whether this particular app is working or up to date.`,
      verb,
      appId: app.id,
      shortcutName: null,
      slots: [],
      phrases: [],
    };
  }
}

/** The one tool that remembers between conversations: what the owner was already told. */
function whatsNewSpec(apps: readonly AppDefinition[]): ToolSpec {
  const ids = apps.map((app) => app.id);
  const example = apps[0] === undefined ? '' : ` or "what's new in my ${apps[0].label}?"`;
  return {
    name: 'whats_new',
    title: "What's new",
    description: `Tell the user what is new in their own data since they last asked: for each app, how many entries arrived after the newest one they were already told about, and the newest titles. StackVoice remembers what it told them across conversations and restarts. Use when the user asks "what's new?", "anything new since last time?"${example}. Pass app to ask about one app: ${orList(ids)}.`,
    verb: 'whats_new',
    appId: null,
    shortcutName: null,
    slots: [],
    phrases: [],
  };
}

function orList(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1] as string}`;
}

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "a", "a" or "b", "a", "b" or "c": the phrases a shortcut listens for, quoted. */
function orPhrases(phrases: readonly string[]): string {
  const quoted = phrases.map((phrase) => `"${phrase}"`);
  if (quoted.length <= 1) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1] as string}`;
}

function listTools(tools: readonly string[]): string {
  if (tools.length <= 1) return tools[0] ?? 'nothing';
  return `${tools.slice(0, -1).join(', ')} and ${tools[tools.length - 1] as string}`;
}
