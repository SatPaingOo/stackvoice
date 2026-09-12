import type { AppDefinition } from '../domain/app-definition.js';
import type { ToolSpec } from '../domain/tool-spec.js';

/**
 * Turns app config into the tools to expose. This is the config→tools brain,
 * and it is a pure function over the domain: no I/O, no SDK, trivially testable.
 *
 * Tool descriptions are generated from each app's own label and description,
 * because the description is how the assistant decides *when* to call a tool.
 */
export class ToolCatalogService {
  generate(apps: readonly AppDefinition[]): readonly ToolSpec[] {
    const specs: ToolSpec[] = [
      {
        name: 'stack_status',
        title: 'Stack status',
        description:
          "Report whether the user's own data stack is healthy: which apps are configured, whether their most recent runs succeeded, and how fresh the data is. Use when the user asks about the state of their stack, for example \"is everything running?\" or \"did my pipelines work last night?\".",
        verb: 'stack_status',
        appId: null,
      },
    ];

    for (const app of apps.filter((candidate) => candidate.enabled)) {
      for (const verb of app.enabledVerbs()) {
        specs.push(this.specFor(app, verb));
      }
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
      };
    }

    if (verb === 'read') {
      return {
        name: `${app.id}_read`,
        title: `Read from ${app.label}`,
        description: `Read one full entry from the user's own "${app.label}" by its key. ${what} Use after a search, when the user asks for the detail of a specific entry.`,
        verb,
        appId: app.id,
      };
    }

    return {
      name: `${app.id}_status`,
      title: `${app.label} status`,
      description: `Report the health of the user's "${app.label}": whether its most recent run succeeded, how fresh its data is, and how much it holds. ${what} Use when the user asks whether this particular app is working or up to date.`,
      verb,
      appId: app.id,
    };
  }
}
