/**
 * The health payload shared by the `stack_status` tool, the per-app
 * `{id}_status` tools (Stage 2), and the management CLI (Stage 4). One shape,
 * three renderings: spoken summary, table, JSON.
 */
export interface SourceHealth {
  readonly sourceId: string;
  readonly ok: boolean;
  readonly lastRunAt: string | null;
  readonly lastDataDate: string | null;
  readonly itemCount: number | null;
  readonly latencyMs: number | null;
  readonly lastError: string | null;
}

export interface AppHealth {
  readonly appId: string;
  readonly enabled: boolean;
  readonly ok: boolean;
  readonly sources: readonly SourceHealth[];
}

export interface StackHealth {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly apps: readonly AppHealth[];
}
