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

    for (const app of apps.filter((candidate) => candidate.enabled)) {
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
