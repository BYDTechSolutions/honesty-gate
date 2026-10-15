import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { presets } from './presets.js';
import type { Config, Level, PresetName, Rule, Scope } from './types.js';

/** Thrown for a bad config or bad options. The CLI exits with code 2 on it. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** File names looked for in `cwd`, in this order. */
export const CONFIG_FILES = ['honesty-gate.config.mjs', 'honesty-gate.config.js', 'honesty-gate.config.json'] as const;

/**
 * Type helper for a config file. Returns its argument unchanged.
 *
 * @example
 * ```js
 * // honesty-gate.config.mjs
 * import { defineConfig } from '@bydtech/honesty-gate';
 * export default defineConfig({ dir: 'dist', rules: [] });
 * ```
 */
export function defineConfig(config: Config): Config {
  return config;
}

/**
 * Load a config file: the given path, or the first of {@link CONFIG_FILES}
 * found in `cwd`. Resolves to `{}` (and `path: undefined`) when there is none.
 * A `.mjs`/`.js` file must default-export the config.
 */
export async function loadConfig(options: { cwd?: string; path?: string } = {}): Promise<{ config: Config; path?: string }> {
  const cwd = options.cwd ?? process.cwd();
  let file: string | undefined;
  if (options.path) {
    file = resolve(cwd, options.path);
    if (!existsSync(file)) throw new ConfigError(`Config file not found: ${options.path}`);
  } else {
    file = CONFIG_FILES.map((name) => resolve(cwd, name)).find((p) => existsSync(p));
    if (!file) return { config: {} };
  }

  let loaded: unknown;
  try {
    if (file.endsWith('.json')) {
      loaded = JSON.parse(await readFile(file, 'utf8'));
    } else {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      loaded = mod.default;
    }
  } catch (err) {
    throw new ConfigError(`Could not load ${file}: ${(err as Error).message}`);
  }
  if (loaded === null || typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new ConfigError(`${file} must export an object (use \`export default\` in a .mjs/.js file)`);
  }
  validateConfig(loaded as Config, file);
  return { config: loaded as Config, path: file };
}

const SCOPES: readonly Scope[] = ['text', 'attr', 'raw', 'all'];
const LEVELS: readonly Level[] = ['error', 'warn'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/** Throw a {@link ConfigError} describing the first problem in `config`. */
export function validateConfig(config: Config, source = 'config', extraKeys: readonly string[] = []): void {
  const known = new Set(['dir', 'include', 'exclude', 'extends', 'rules', 'levels', 'attributes', 'allowEmpty', ...extraKeys]);
  for (const key of Object.keys(config)) {
    if (!known.has(key)) throw new ConfigError(`${source}: unknown option "${key}"`);
  }
  if (config.dir !== undefined && typeof config.dir !== 'string') throw new ConfigError(`${source}: "dir" must be a string`);
  if (config.allowEmpty !== undefined && typeof config.allowEmpty !== 'boolean') throw new ConfigError(`${source}: "allowEmpty" must be true or false`);
  for (const key of ['include', 'exclude', 'attributes'] as const) {
    if (config[key] !== undefined && !isStringArray(config[key])) throw new ConfigError(`${source}: "${key}" must be an array of strings`);
  }
  if (config.extends !== undefined) {
    if (!isStringArray(config.extends)) throw new ConfigError(`${source}: "extends" must be an array of preset names`);
    for (const name of config.extends) {
      if (!(name in presets)) throw new ConfigError(`${source}: unknown preset "${name}" (available: ${Object.keys(presets).join(', ')})`);
    }
  }
  if (config.levels !== undefined) {
    if (typeof config.levels !== 'object' || config.levels === null || Array.isArray(config.levels)) {
      throw new ConfigError(`${source}: "levels" must be an object of rule id to "error", "warn" or "off"`);
    }
    for (const [id, level] of Object.entries(config.levels)) {
      if (level !== 'off' && !LEVELS.includes(level as Level)) {
        throw new ConfigError(`${source}: level for "${id}" must be "error", "warn" or "off"`);
      }
    }
  }
  if (config.rules !== undefined) {
    if (!Array.isArray(config.rules)) throw new ConfigError(`${source}: "rules" must be an array`);
    config.rules.forEach((rule, i) => validateRule(rule, `${source}: rules[${i}]`));
  }
}

function validateRule(rule: Rule, where: string): void {
  if (rule === null || typeof rule !== 'object') throw new ConfigError(`${where} must be an object`);
  if (typeof rule.id !== 'string' || !rule.id) throw new ConfigError(`${where} needs an "id"`);
  where = `${where} ("${rule.id}")`;
  if (typeof rule.message !== 'string' || !rule.message) throw new ConfigError(`${where} needs a "message"`);
  if (!(rule.pattern instanceof RegExp) && typeof rule.pattern !== 'string') {
    throw new ConfigError(`${where}: "pattern" must be a string or a RegExp`);
  }
  if (typeof rule.pattern === 'string' && !rule.pattern) throw new ConfigError(`${where}: "pattern" is empty`);
  const scopes = rule.scope === undefined ? [] : Array.isArray(rule.scope) ? rule.scope : [rule.scope];
  for (const s of scopes) {
    if (!SCOPES.includes(s)) throw new ConfigError(`${where}: unknown scope "${String(s)}" (use ${SCOPES.join(', ')})`);
  }
  if (rule.level !== undefined && !LEVELS.includes(rule.level)) throw new ConfigError(`${where}: "level" must be "error" or "warn"`);
  for (const key of ['include', 'exclude'] as const) {
    if (rule[key] !== undefined && !isStringArray(rule[key])) throw new ConfigError(`${where}: "${key}" must be an array of strings`);
  }
  compilePattern(rule, where);
}

/** A rule ready to run: pattern compiled, scope expanded, level resolved. */
export interface ResolvedRule {
  id: string;
  message: string;
  level: Level;
  regex: RegExp;
  scopes: Array<'text' | 'attr' | 'raw'>;
  include?: string[];
  exclude?: string[];
}

function compilePattern(rule: Rule, where: string): RegExp {
  try {
    if (rule.pattern instanceof RegExp) {
      const flags = rule.pattern.flags.replace(/[gy]/g, '');
      return new RegExp(rule.pattern.source, `${flags}g`);
    }
    const flags = (rule.flags ?? '').replace(/[gy]/g, '');
    return new RegExp(rule.pattern, `${flags}g`);
  } catch (err) {
    throw new ConfigError(`${where}: invalid pattern: ${(err as Error).message}`);
  }
}

/**
 * Turn presets, custom rules and level overrides into the list of rules that
 * run. Custom rules replace preset rules with the same id.
 */
export function resolveRules(config: Pick<Config, 'extends' | 'rules' | 'levels'>): ResolvedRule[] {
  const names: PresetName[] = config.extends ?? ['placeholders'];
  const byId = new Map<string, Rule>();
  for (const name of names) {
    const preset = presets[name];
    if (!preset) throw new ConfigError(`unknown preset "${name}"`);
    for (const rule of preset) byId.set(rule.id, rule);
  }
  for (const rule of config.rules ?? []) {
    validateRule(rule, 'rule');
    byId.set(rule.id, rule);
  }
  const levels = config.levels ?? {};
  for (const id of Object.keys(levels)) {
    if (!byId.has(id)) throw new ConfigError(`"levels" names a rule that does not exist: "${id}"`);
  }
  const out: ResolvedRule[] = [];
  for (const rule of byId.values()) {
    const override = levels[rule.id];
    if (override === 'off') continue;
    const raw: Scope[] = rule.scope === undefined ? ['all'] : Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    const scopes = new Set<'text' | 'attr' | 'raw'>();
    for (const s of raw) {
      if (s === 'all') {
        scopes.add('text');
        scopes.add('attr');
      } else scopes.add(s);
    }
    out.push({
      id: rule.id,
      message: rule.message,
      level: override ?? rule.level ?? 'error',
      regex: compilePattern(rule, `rule "${rule.id}"`),
      scopes: [...scopes],
      ...(rule.include ? { include: rule.include } : {}),
      ...(rule.exclude ? { exclude: rule.exclude } : {}),
    });
  }
  return out;
}
