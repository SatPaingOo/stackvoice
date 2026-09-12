import type { HealthService } from '../../application/health.service.js';
import type { ManagementService } from '../../application/management.service.js';
import type { AppDefinition } from '../../domain/app-definition.js';
import type { FieldMap } from '../../domain/data-source.js';
import type { SourceProposal } from '../../domain/source-proposal.js';
import { bold, cross, dim, green, print, red, table, tick, yellow } from './output.js';

export interface CommandDeps {
  readonly management: ManagementService;
  readonly health: HealthService;
}

export interface ParsedArgs {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

/** `--id foo --yes -b main` into positionals and flags. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i += 1;
    }
  }

  return { positional, flags };
}

export function printUsage(): void {
  print(`${bold('stackvoice')} — manage the apps your assistant can reach.

${bold('Usage')}
  stackvoice apps                        list configured apps
  stackvoice status                      health of every app
  stackvoice shortcuts                   list shortcuts and what they run
  stackvoice app show <id>               the effective config of one app
  stackvoice app validate [<id>]         check config without starting the server
  stackvoice app add <id> --repo <o/n>   inspect a repo and write an app file
  stackvoice app enable <id>             turn an app on
  stackvoice app disable <id>            turn an app off
  stackvoice app remove <id> --yes       delete an app file (a backup is kept)

${bold('Options')}
  --repo <owner/name>   the public GitHub repository holding your read models
  --branch <name>       branch to read (default: main)
  --label "<text>"      human name, used in the tool descriptions
  --description "<t>"   what this app holds; the assistant reads it to decide when to call it
  --config <path>       settings file (default: config/settings.yml)
  --apps <path>         apps directory (default: config/apps)

${bold('Example')}
  stackvoice app add weather --repo me/weather-pipeline --label "Weather history"
`);
}

export async function runApps(deps: CommandDeps): Promise<number> {
  const apps = await deps.management.list();
  if (apps.length === 0) {
    print(`  No apps configured. Add one with ${bold('stackvoice app add <id> --repo <owner/name>')}.`);
    return 0;
  }

  table(
    ['ID', 'LABEL', 'ENABLED', 'TOOLS'],
    apps.map((app) => [
      app.id,
      app.label,
      app.enabled ? green('yes') : dim('no'),
      app.enabled ? toolNames(app).join(', ') : dim('none'),
    ]),
  );
  return 0;
}

export async function runShortcuts(deps: CommandDeps): Promise<number> {
  const shortcuts = await deps.management.listShortcuts();
  if (shortcuts.length === 0) {
    print(`  No shortcuts. Build one in the console at ${bold('/console')}.`);
    return 0;
  }

  table(
    ['TOOL', 'SAY', 'RUNS', 'ENABLED'],
    shortcuts.map((shortcut) => [
      shortcut.toolName,
      shortcut.name,
      shortcut.steps.map((step) => step.tool).join(' → '),
      shortcut.enabled ? green('yes') : dim('no'),
    ]),
  );
  return 0;
}

export async function runStatus(deps: CommandDeps): Promise<number> {
  const health = await deps.health.reportStack();
  if (health.apps.length === 0) {
    print('  No enabled apps to check.');
    return 0;
  }

  table(
    ['', 'APP', 'LAST RUN', 'ITEMS', 'FRESH TO', 'NOTE'],
    health.apps.map((app) => {
      const source = app.sources[0];
      return [
        app.ok ? tick() : cross(),
        app.appId,
        source?.lastRunAt?.slice(0, 16).replace('T', ' ') ?? dim('unknown'),
        source?.itemCount === null || source?.itemCount === undefined ? dim('-') : String(source.itemCount),
        source?.lastDataDate?.slice(0, 10) ?? dim('-'),
        source?.lastError === null || source?.lastError === undefined ? '' : red(source.lastError),
      ];
    }),
  );

  print();
  print(health.ok ? `  ${tick()} stack healthy` : `  ${cross()} ${red('stack has problems')}`);
  return health.ok ? 0 : 1;
}

export async function runShow(deps: CommandDeps, id: string): Promise<number> {
  const app = await deps.management.show(id);

  print(`  ${bold(app.label)}  ${dim(`(${app.id})`)}`);
  print(`  ${app.description}`);
  print();
  print(`  enabled   ${app.enabled ? green('yes') : yellow('no')}`);
  print(`  tools     ${toolNames(app).join(', ') || dim('none')}`);
  for (const source of app.sources) {
    print();
    print(`  ${bold('source')} ${source.id}  ${dim(source.type)}`);
    print(`    repo        ${source.repo}`);
    print(`    index       ${source.indexFile}${source.itemsPath === null ? '' : dim(` → ${source.itemsPath}`)}`);
    print(`    stats       ${source.statsFile}`);
    print(`    fields      ${describeFields(source.fields)}`);
  }
  return 0;
}

export async function runValidate(deps: CommandDeps, id?: string): Promise<number> {
  const reports = await deps.management.validate(id);
  let failed = 0;

  for (const report of reports) {
    if (report.ok) {
      print(`  ${tick()} ${report.appId}`);
    } else {
      failed += 1;
      print(`  ${cross()} ${report.appId}`);
      print(`    ${red(report.problem ?? 'unknown problem')}`);
    }
  }

  print();
  print(failed === 0 ? `  ${tick()} config is valid` : `  ${cross()} ${red(`${failed} problem(s)`)}`);
  return failed === 0 ? 0 : 1;
}

export async function runAdd(
  deps: CommandDeps,
  id: string,
  options: { repo: string; branch?: string | undefined; label?: string | undefined; description?: string | undefined },
): Promise<number> {
  print(`  Looking at ${bold(options.repo)}…`);

  const result = await deps.management.addFromRepo({
    id,
    repo: options.repo,
    branch: options.branch,
    label: options.label,
    description: options.description,
  });

  printProposal(result.proposal);
  print();
  print(`  ${tick()} wrote ${bold(`config/apps/${id}.yml`)}${result.replaced ? yellow(' (replaced)') : ''}`);
  if (result.backupPath !== null) print(`    ${dim(`previous version kept at ${result.backupPath}`)}`);
  print();
  print(`  New tools once the server picks it up: ${bold(toolNames(result.app).join(', '))}`);
  print(`  ${dim('Check the guesses above. Any of them can be changed in the file.')}`);
  return 0;
}

export async function runSetEnabled(deps: CommandDeps, id: string, enabled: boolean): Promise<number> {
  const app = await deps.management.setEnabled(id, enabled);
  print(`  ${tick()} ${app.id} is now ${enabled ? green('enabled') : yellow('disabled')}`);
  return 0;
}

export async function runRemove(deps: CommandDeps, id: string, confirmed: boolean): Promise<number> {
  if (!confirmed) {
    print(`  ${yellow('This deletes')} config/apps/${id}.yml. Re-run with ${bold('--yes')} to confirm.`);
    return 1;
  }

  const backup = await deps.management.remove(id);
  print(`  ${tick()} removed ${id}`);
  print(`    ${dim(`backup kept at ${backup}`)}`);
  return 0;
}

/** Shows what was inferred, with a sample value, so the guess can be judged. */
function printProposal(proposal: SourceProposal): void {
  print(`  Found ${bold(String(proposal.itemCount))} records in ${proposal.indexFile}${
    proposal.itemsPath === null ? '' : ` under "${proposal.itemsPath}"`
  }.`);
  print();
  print(`  ${bold('Field mapping')} ${dim('(inferred)')}`);

  table(
    ['FIELD', 'FROM', 'EXAMPLE'],
    proposal.evidence.map((row) => [
      row.field,
      row.path === null ? dim('not found') : row.path,
      row.sample === null ? dim('-') : dim(row.sample),
    ]),
  );

  print();
  print(
    `  ${bold('Status')} reads ${proposal.statsFile ?? dim('nothing')}` +
      dim(` — freshness from "${proposal.statusFields.lastDataDate}", count from "${proposal.statusFields.itemCount}"`),
  );
  print();
  print(`  ${dim(`other keys available: ${proposal.availableKeys.join(', ')}`)}`);
}

function toolNames(app: AppDefinition): string[] {
  return app.enabledVerbs().map((verb) => `${app.id}_${verb}`);
}

function describeFields(fields: FieldMap): string {
  return (Object.keys(fields) as (keyof FieldMap)[])
    .map((name) => `${name}=${fields[name] ?? '-'}`)
    .join(' ');
}
