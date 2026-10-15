import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig, resolveRules } from './config.js';
import { formatResult, type Format } from './format.js';
import { scanReport } from './scan.js';
import type { ScanOptions } from './types.js';

export const USAGE = `Usage: honesty-gate [dir] [options]

Fails when placeholder or forbidden copy reached a built page.

Arguments:
  dir                     Directory of built HTML (overrides "dir" in the config)

Options:
  -c, --config <path>     Config file (default: honesty-gate.config.{mjs,js,json} in cwd)
      --no-config         Ignore any config file
  -f, --format <name>     text (default), json, or github
      --include <glob>    Files to scan, relative to dir; repeatable (replaces the config's)
      --exclude <glob>    Files to skip; repeatable (replaces the config's)
      --max-findings <n>  Show at most n findings (errors first); the exit code still counts all
  -q, --quiet             Report errors only; print nothing when clean
      --allow-empty       Pass when no file matches instead of exiting 2
      --list-rules        Print the rules that would run, then exit
  -h, --help              Show this help
  -v, --version           Show the version

Exit codes: 0 no errors (warnings allowed), 1 errors found, 2 usage or config error.`;

/** Where the CLI writes. */
export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

const FORMATS: readonly Format[] = ['text', 'json', 'github'];

function version(): string {
  const require = createRequire(import.meta.url);
  return (require('../package.json') as { version: string }).version;
}

/** Run the CLI with `argv` (without the node and script paths). Resolves to the exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        config: { type: 'string', short: 'c' },
        'no-config': { type: 'boolean' },
        format: { type: 'string', short: 'f' },
        include: { type: 'string', multiple: true },
        exclude: { type: 'string', multiple: true },
        'max-findings': { type: 'string' },
        quiet: { type: 'boolean', short: 'q' },
        'allow-empty': { type: 'boolean' },
        'list-rules': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (err) {
    io.stderr(`honesty-gate: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (values.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (values.version) {
    io.stdout(version());
    return 0;
  }

  const usage = (message: string) => {
    io.stderr(`honesty-gate: ${message}`);
    return 2;
  };
  if (positionals.length > 1) return usage(`expected one directory, got ${positionals.length}: ${positionals.join(' ')}`);
  const format = (values.format ?? 'text') as Format;
  if (!FORMATS.includes(format)) return usage(`unknown format "${values.format}" (use ${FORMATS.join(', ')})`);
  let maxFindings: number | undefined;
  if (values['max-findings'] !== undefined) {
    maxFindings = Number(values['max-findings']);
    if (!Number.isInteger(maxFindings) || maxFindings < 0) return usage('--max-findings needs a whole number of 0 or more');
  }
  if (values.config && values['no-config']) return usage('--config and --no-config cannot be used together');

  try {
    const { config } = values['no-config'] ? { config: {} } : await loadConfig({ cwd: io.cwd, path: values.config });
    const options: ScanOptions = { ...config, cwd: io.cwd };
    if (positionals[0]) options.dir = positionals[0];
    if (values.include) options.include = values.include;
    if (values.exclude) options.exclude = values.exclude;
    if (values['allow-empty']) options.allowEmpty = true;

    if (values['list-rules']) {
      const rules = resolveRules(options);
      io.stdout(
        rules
          .map((r) => `${r.level === 'error' ? 'error' : 'warn '}  ${r.id.padEnd(32)} ${r.scopes.join('+').padEnd(9)} ${r.message}`)
          .join('\n'),
      );
      return 0;
    }

    const result = await scanReport(options);
    const output = formatResult(result, format, { quiet: values.quiet ?? false, ...(maxFindings !== undefined ? { maxFindings } : {}) });
    if (output) io.stdout(output);
    return result.errorCount ? 1 : 0;
  } catch (err) {
    if (err instanceof ConfigError) return usage(err.message);
    throw err;
  }
}
