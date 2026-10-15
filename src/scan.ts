import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ConfigError, resolveRules, validateConfig, type ResolvedRule } from './config.js';
import { matchesAny } from './glob.js';
import { DEFAULT_ATTRIBUTES, lineIndex, readHtml, textToSource } from './html.js';
import type { Finding, ScanOptions, ScanResult } from './types.js';

/** Default `include`. */
export const DEFAULT_INCLUDE = ['**/*.html', '**/*.htm'];
/** Default `exclude`. */
export const DEFAULT_EXCLUDE = ['**/node_modules/**'];

const HTML_FILE = /\.(?:html?|xhtml)$/i;
const CONTEXT = 40;

const toPosix = (p: string) => p.split(sep).join('/');

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      // Symlinks are not followed: a build directory does not need them, and
      // a link back up the tree would loop.
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  await visit(root);
  return out.sort();
}

function snippet(hay: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT);
  const end = Math.min(hay.length, index + length + CONTEXT);
  const body = hay.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < hay.length ? '…' : ''}`;
}

/**
 * Scan a directory of built HTML and return every finding with counts.
 * Does not read a config file: pass the options, or load one with
 * {@link loadConfig} first.
 *
 * @throws {ConfigError} for bad options, a missing directory, or (unless
 * `allowEmpty`) a directory with no matching files.
 */
export async function scanReport(options: ScanOptions): Promise<ScanResult> {
  validateConfig(options, 'options', ['cwd']);
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!options.dir) throw new ConfigError('No directory to scan: pass one, or set "dir" in the config');
  const root = resolve(cwd, options.dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new ConfigError(`Not a directory: ${options.dir}`);

  const rules = resolveRules(options);
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const attributeNames = options.attributes ?? DEFAULT_ATTRIBUTES;

  const files = (await walk(root))
    .map((abs) => ({ abs, rel: toPosix(relative(root, abs)) }))
    .filter(({ rel }) => matchesAny(rel, include) && !matchesAny(rel, exclude));
  if (!files.length && !options.allowEmpty) {
    throw new ConfigError(`No files in ${options.dir} match ${include.join(', ')}. Wrong directory, or did the build not run?`);
  }

  const findings: Finding[] = [];
  for (const { abs, rel } of files) {
    const applicable = rules.filter(
      (r) => (!r.include || matchesAny(rel, r.include)) && (!r.exclude || !matchesAny(rel, r.exclude)),
    );
    if (!applicable.length) continue;
    const source = (await readFile(abs, 'utf8')).replace(/^﻿/, '');
    findings.push(...checkSource(source, toPosix(relative(cwd, abs)), applicable, HTML_FILE.test(rel), attributeNames));
  }

  return {
    findings,
    files: files.map(({ abs }) => toPosix(relative(cwd, abs))),
    errorCount: findings.filter((f) => f.level === 'error').length,
    warningCount: findings.filter((f) => f.level === 'warn').length,
  };
}

/**
 * Scan a directory of built HTML and return the findings.
 * See {@link scanReport} for the version with file list and counts.
 */
export async function scan(options: ScanOptions): Promise<Finding[]> {
  return (await scanReport(options)).findings;
}

/**
 * Run rules over one document. A file that is not HTML (any include that
 * does not end in `.html`, `.htm` or `.xhtml`, such as `llms.txt`) is read
 * as plain text: its `text` and `raw` views are the whole file and it has no
 * attributes.
 */
export function checkSource(
  source: string,
  file: string,
  rules: readonly ResolvedRule[],
  isHtml = true,
  attributeNames: readonly string[] = DEFAULT_ATTRIBUTES,
): Finding[] {
  const lineOf = lineIndex(source);
  const readable =
    isHtml && rules.some((r) => r.scopes.includes('text') || r.scopes.includes('attr'))
      ? readHtml(source, attributeNames)
      : undefined;
  const out: Finding[] = [];

  for (const rule of rules) {
    const base = { file, ruleId: rule.id, message: rule.message, level: rule.level };
    // Plain text has one view: `text` and `raw` are the same bytes, read once.
    const scopes = isHtml
      ? rule.scopes
      : rule.scopes.includes('text')
        ? (['text'] as const)
        : rule.scopes.includes('raw')
          ? (['raw'] as const)
          : [];
    for (const scope of scopes) {
      if (scope === 'raw' || (scope === 'text' && !readable)) {
        for (const m of source.matchAll(rule.regex)) {
          if (!m[0]) continue;
          out.push({ ...base, line: lineOf(m.index), scope, match: m[0], context: snippet(source, m.index, m[0].length) });
        }
      } else if (scope === 'text' && readable) {
        for (const m of readable.text.matchAll(rule.regex)) {
          if (!m[0]) continue;
          const line = lineOf(textToSource(readable.textMap, m.index));
          out.push({ ...base, line, scope, match: m[0], context: snippet(readable.text, m.index, m[0].length) });
        }
      } else if (scope === 'attr' && readable) {
        for (const attr of readable.attributes) {
          for (const m of attr.value.matchAll(rule.regex)) {
            if (!m[0]) continue;
            out.push({
              ...base,
              line: lineOf(attr.offset),
              scope,
              attribute: attr.name,
              match: m[0],
              context: `${attr.name}="${snippet(attr.value, m.index, m[0].length)}"`,
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
}
