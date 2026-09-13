/**
 * Terminal output helpers.
 *
 * Colour is switched off when output is piped or when NO_COLOR is set, so the
 * CLI stays readable in a log file and in a demo recording alike.
 */
const useColor = process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined;

// Literal escape bytes in source are easy to lose to a copy-paste; spell them.
const ESC = '\u001b';
const wrap = (code: string, text: string): string =>
  useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const bold = (text: string): string => wrap('1', text);
export const dim = (text: string): string => wrap('2', text);
export const green = (text: string): string => wrap('32', text);
export const red = (text: string): string => wrap('31', text);
export const yellow = (text: string): string => wrap('33', text);

export const tick = (): string => green('✓');
export const cross = (): string => red('✗');

export function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

export function printError(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Renders a table, padding to the widest cell in each column.
 *
 * Colour codes do not occupy screen columns, so widths are measured on the
 * visible text; padding the coloured string directly misaligns every row.
 */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = headers.map((header, index) =>
    Math.max(visibleLength(header), ...rows.map((row) => visibleLength(row[index] ?? ''))),
  );

  print(`  ${headers.map((header, i) => bold(pad(header, widths[i] ?? 0))).join('  ')}`);
  for (const row of rows) {
    print(`  ${row.map((cell, i) => pad(cell, widths[i] ?? 0)).join('  ')}`);
  }
}

function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex -- terminal colour codes start with the escape character
  return text.replace(/\u001b\[\d+m/g, '').length;
}

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
}
