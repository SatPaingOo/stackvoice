import type { SourceProposal } from '../source-proposal.js';

/**
 * Looks at a data source nobody has configured yet and proposes how to read it.
 *
 * One implementation per source type, same as `DataSourceReader`: adding
 * `json-url` means adding an inspector alongside the adapter, and the
 * management service is untouched.
 */
export interface SourceInspector {
  /** @throws {SourceUnavailableError} when nothing readable was found. */
  inspect(repo: string, branch?: string): Promise<SourceProposal>;
}
