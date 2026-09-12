import type { SourceProposal } from '../source-proposal.js';

/** Something a person pointed at, before anyone knows what is inside it. */
export type SourceTarget =
  | { readonly type: 'github-repo'; readonly repo: string; readonly branch?: string | undefined }
  | {
      readonly type: 'url';
      readonly url: string;
      /** May reference secrets as {{secret:NAME}}; the inspector resolves them to fetch. */
      readonly headers?: Readonly<Record<string, string>> | undefined;
    }
  | { readonly type: 'file'; readonly path: string };

/**
 * Looks at a data source nobody has configured yet and proposes how to read it.
 *
 * One implementation per source type, like `DataSourceReader`, behind one
 * composite that routes by target type. Adding a source type adds an inspector;
 * the management service is untouched.
 */
export interface SourceInspector {
  /** @throws {SourceUnavailableError} when nothing readable was found. */
  inspect(target: SourceTarget): Promise<SourceProposal>;
}
