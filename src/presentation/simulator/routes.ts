import type { Express, Request, Response } from 'express';

import type { ConversationService } from '../../application/conversation.service.js';
import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import { StackVoiceError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import { renderSimulatorPage, type SimulatorAppSummary } from './page.js';

export interface SimulatorDeps {
  readonly conversation: ConversationService;
  readonly registry: AppRegistryService;
  readonly shortcuts: ShortcutRegistryService;
  readonly logger: Logger;
}

const MAX_UTTERANCE_LENGTH = 400;

/**
 * The simulated Alexa+ surface.
 *
 * The hackathon rules accept a simulated experience in place of a real Alexa+
 * integration, which matters because the MCP Toolkit is US-only. This is that
 * surface: it speaks to the same MCP server over the same transport a device
 * would use, and shows each tool call as it happens so the mechanism is visible
 * rather than claimed.
 */
export function installSimulator(app: Express, deps: SimulatorDeps): void {
  app.get('/simulator', (_req, res) => {
    const phrases = deps.shortcuts.listEnabled().map((shortcut) => shortcut.phrases()[0] ?? shortcut.name);
    res.type('html').send(renderSimulatorPage(summarize(deps.registry), phrases));
  });

  app.get('/simulator/api/apps', (_req, res) => {
    res.json({ apps: summarize(deps.registry) });
  });

  app.post('/simulator/api/ask', async (req: Request, res: Response) => {
    const body = req.body as { utterance?: unknown; context?: unknown };
    const utterance = typeof body.utterance === 'string' ? body.utterance.slice(0, MAX_UTTERANCE_LENGTH) : '';

    if (utterance.trim() === '') {
      res.status(400).json({ error: 'utterance is required' });
      return;
    }

    try {
      const turn = await deps.conversation.respond({
        utterance,
        context: readContext(body.context),
      });
      res.json(turn);
    } catch (error) {
      const message = error instanceof StackVoiceError ? error.message : 'The server could not answer that.';
      deps.logger.warn('simulator turn failed', { reason: message });
      res.status(502).json({ spoken: message, trace: null, context: readContext(body.context) });
    }
  });
}

function summarize(registry: AppRegistryService): SimulatorAppSummary[] {
  return registry.listEnabled().map((app) => ({
    id: app.id,
    label: app.label,
    searchable: app.primitives.search,
  }));
}

/** The client owns the conversation context; trust only its shape. */
function readContext(value: unknown): { lastKey?: string; lastAppId?: string } {
  if (value === null || typeof value !== 'object') return {};
  const raw = value as { lastKey?: unknown; lastAppId?: unknown };
  return {
    ...(typeof raw.lastKey === 'string' ? { lastKey: raw.lastKey } : {}),
    ...(typeof raw.lastAppId === 'string' ? { lastAppId: raw.lastAppId } : {}),
  };
}
