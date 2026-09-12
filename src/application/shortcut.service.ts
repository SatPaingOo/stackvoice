import { StackVoiceError } from '../domain/errors.js';
import type { Logger } from '../domain/ports/logger.js';
import { renderReply, type Shortcut } from '../domain/shortcut.js';
import type { ToolOutput, ToolRunner } from './tool-runner.service.js';

export interface ShortcutResult {
  readonly spoken: string;
  /** Each step's own output, so a caller can see what ran. */
  readonly steps: readonly { tool: string; spoken: string; ok: boolean }[];
}

/**
 * Runs a shortcut's steps in order and stitches the answers into one.
 *
 * In order, not in parallel: a brief that reads the news before the weather on
 * one morning and after it on the next is a worse brief, and the whole point of
 * a shortcut is that it is deterministic.
 *
 * A failing step does not sink the answer. Being told the library is fine and
 * the market feed is down beats being told nothing at all.
 */
export class ShortcutService {
  constructor(
    private readonly runner: ToolRunner,
    private readonly logger: Logger,
  ) {}

  async run(shortcut: Shortcut): Promise<ShortcutResult> {
    const steps: { tool: string; spoken: string; ok: boolean }[] = [];

    for (const step of shortcut.steps) {
      let output: ToolOutput;
      try {
        output = await this.runner.run(step.tool, step.args);
        steps.push({ tool: step.tool, spoken: output.spoken, ok: true });
      } catch (error) {
        const message =
          error instanceof StackVoiceError ? error.message : `${step.tool} did not answer.`;
        this.logger.warn('shortcut step failed', { shortcut: shortcut.name, tool: step.tool });
        steps.push({ tool: step.tool, spoken: message, ok: false });
      }
    }

    return {
      spoken: renderReply(
        shortcut.reply,
        steps.map((step) => step.spoken),
      ),
      steps,
    };
  }
}
