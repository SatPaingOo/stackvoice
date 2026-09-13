import type { ToolCaller } from '../domain/ports/tool-caller.js';
import type { AppRegistryService } from './app-registry.service.js';
import { IntentPlanner, type PlannerApp, type PlannerContext, type PlannerShortcut } from './intent-planner.js';
import type { ShortcutRegistryService } from './shortcut-registry.service.js';

export interface TurnRequest {
  readonly utterance: string;
  readonly context: PlannerContext;
}

export interface TurnTrace {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly latencyMs: number;
  readonly isError: boolean;
}

export interface Turn {
  readonly spoken: string;
  /** What actually ran, shown in the simulator so the MCP call is visible. */
  readonly trace: TurnTrace | null;
  /** Carried into the next turn so "tell me more" works. */
  readonly context: PlannerContext;
}

/**
 * One turn of the simulated conversation: understand, call, speak.
 *
 * The understanding is the planner's; the calling goes out over MCP through the
 * `ToolCaller` port; the speaking is whatever the tool already shaped, because
 * the server returns spoken text by design and the simulator has nothing to add.
 */
export class ConversationService {
  constructor(
    private readonly registry: AppRegistryService,
    private readonly caller: ToolCaller,
    private readonly shortcuts: ShortcutRegistryService,
    private readonly planner: IntentPlanner = new IntentPlanner(),
  ) {}

  async respond(request: TurnRequest): Promise<Turn> {
    const apps = this.plannerApps();
    const plan = this.planner.plan(request.utterance, apps, request.context, this.plannerShortcuts());

    if (plan.kind === 'unclear') {
      return { spoken: plan.spoken, trace: null, context: request.context };
    }

    const outcome = await this.caller.callTool(plan.call.tool, plan.call.args);

    return {
      spoken: outcome.spoken,
      trace: {
        tool: plan.call.tool,
        args: plan.call.args,
        latencyMs: outcome.latencyMs,
        isError: outcome.isError,
      },
      // The key and the app it belongs to move together. Updating them
      // separately let a status call re-point the app while leaving the
      // previous app's key behind, so "tell me more" looked the wrong entry up
      // in the wrong app.
      context: nextContext(plan.appId, outcome.structured, request.context),
    };
  }

  /** The enabled shortcuts, flattened to what the planner needs. */
  private plannerShortcuts(): readonly PlannerShortcut[] {
    return this.shortcuts.listEnabled().map((shortcut) => ({
      toolName: shortcut.toolName,
      phrases: shortcut.phrases(),
    }));
  }

  /** The configured apps, flattened to what the planner needs. */
  private plannerApps(): readonly PlannerApp[] {
    return this.registry.listEnabled().map((app) => ({
      id: app.id,
      label: app.label,
      search: app.primitives.search,
      read: app.primitives.read,
      status: app.primitives.status,
    }));
  }
}

/**
 * A key is only useful alongside the app it came from, so either both change or
 * neither does.
 */
function nextContext(
  appId: string | null,
  structured: Record<string, unknown> | null,
  previous: PlannerContext,
): PlannerContext {
  const key = firstKey(structured);
  if (key === undefined || appId === null) return previous;
  return { lastKey: key, lastAppId: appId };
}

/**
 * Pulls a followable key out of a tool result: the first search hit, or the
 * entry a read returned. Anything else leaves the context alone.
 */
function firstKey(structured: Record<string, unknown> | null): string | undefined {
  if (structured === null) return undefined;

  const items = structured['items'];
  if (Array.isArray(items) && items.length > 0) {
    const key = (items[0] as { key?: unknown }).key;
    if (typeof key === 'string') return key;
  }

  const item = structured['item'];
  if (item !== null && typeof item === 'object') {
    const key = (item as { key?: unknown }).key;
    if (typeof key === 'string') return key;
  }

  return undefined;
}
