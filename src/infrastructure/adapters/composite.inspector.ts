import type { SourceInspector, SourceTarget } from '../../domain/ports/source-inspector.js';
import type { SourceProposal } from '../../domain/source-proposal.js';

/**
 * Sends each target to the inspector that understands it.
 *
 * The management service holds one `SourceInspector` and never asks what kind of
 * source it is looking at. A new source type adds an inspector here, not a branch
 * there.
 */
export class CompositeSourceInspector implements SourceInspector {
  constructor(
    private readonly github: SourceInspector,
    private readonly generic: SourceInspector,
  ) {}

  inspect(target: SourceTarget): Promise<SourceProposal> {
    return target.type === 'github-repo' ? this.github.inspect(target) : this.generic.inspect(target);
  }
}
