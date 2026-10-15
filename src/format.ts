import type { Finding, ScanResult } from './types.js';

/** Output formats. */
export type Format = 'text' | 'json' | 'github';

/** Options for {@link formatResult}. */
export interface FormatOptions {
  /** Show at most this many findings. Errors are kept before warnings when capping. */
  maxFindings?: number;
  /** Leave warnings out, and print nothing when the result is clean. */
  quiet?: boolean;
}

function select(result: ScanResult, options: FormatOptions): { shown: Finding[]; hidden: number } {
  let pool = options.quiet ? result.findings.filter((f) => f.level === 'error') : result.findings;
  const max = options.maxFindings;
  if (max === undefined || pool.length <= max) return { shown: pool, hidden: 0 };
  const keep = new Set([...pool.filter((f) => f.level === 'error'), ...pool.filter((f) => f.level === 'warn')].slice(0, max));
  const total = pool.length;
  pool = pool.filter((f) => keep.has(f));
  return { shown: pool, hidden: total - pool.length };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summary(result: ScanResult, quiet?: boolean): string {
  const files = plural(result.files.length, 'file');
  if (!result.errorCount && (quiet || !result.warningCount)) return `honesty-gate: ${files} checked, no problems.`;
  const parts = [plural(result.errorCount, 'error')];
  if (!quiet) parts.push(plural(result.warningCount, 'warning'));
  const affected = new Set(result.findings.filter((f) => !quiet || f.level === 'error').map((f) => f.file)).size;
  return `honesty-gate: ${parts.join(', ')} in ${affected} of ${files}. ${result.errorCount ? 'FAIL' : 'PASS'}`;
}

/** Escape a GitHub workflow command's message. */
function ghData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
/** Escape a GitHub workflow command's property value. */
function ghProp(s: string): string {
  return ghData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** Render a scan result for the terminal, a machine, or GitHub Actions. */
export function formatResult(result: ScanResult, format: Format = 'text', options: FormatOptions = {}): string {
  const { shown, hidden } = select(result, options);

  if (format === 'json') {
    return JSON.stringify(
      {
        files: result.files.length,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        findings: shown,
        ...(hidden ? { omitted: hidden } : {}),
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  if (format === 'github') {
    for (const f of shown) {
      const props = `file=${ghProp(f.file)},line=${f.line},title=${ghProp(f.ruleId)}`;
      lines.push(`::${f.level === 'error' ? 'error' : 'warning'} ${props}::${ghData(`${f.message}: ${f.context}`)}`);
    }
  } else {
    let current = '';
    for (const f of shown) {
      if (f.file !== current) {
        if (current) lines.push('');
        lines.push(f.file);
        current = f.file;
      }
      const where = f.scope === 'attr' ? `${f.scope}:${f.attribute}` : f.scope;
      lines.push(`  ${String(f.line).padStart(5)}  ${f.level === 'error' ? 'error' : 'warn '}  ${f.message}  ${f.ruleId} (${where})`);
      lines.push(`         ${f.context}`);
    }
    if (shown.length) lines.push('');
  }
  if (hidden) lines.push(`… ${plural(hidden, 'more finding')} not shown (--max-findings).`);
  const clean = !result.errorCount && (options.quiet || !result.warningCount);
  if (!(clean && options.quiet)) lines.push(summary(result, options.quiet));
  return lines.join('\n');
}
