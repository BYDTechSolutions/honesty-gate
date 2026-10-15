/**
 * `@bydtech/honesty-gate`: fail a build when placeholder or forbidden copy
 * reaches a rendered page.
 *
 * @example
 * ```ts
 * import { scan } from '@bydtech/honesty-gate';
 * const findings = await scan({ dir: 'dist' });
 * if (findings.some((f) => f.level === 'error')) process.exit(1);
 * ```
 *
 * @packageDocumentation
 */
export { scan, scanReport, checkSource, DEFAULT_INCLUDE, DEFAULT_EXCLUDE } from './scan.js';
export { defineConfig, loadConfig, resolveRules, validateConfig, ConfigError, CONFIG_FILES } from './config.js';
export type { ResolvedRule } from './config.js';
export { presets, placeholders } from './presets.js';
export { formatResult } from './format.js';
export type { Format, FormatOptions } from './format.js';
export { readHtml, decodeEntities, DEFAULT_ATTRIBUTES, SKIPPED_ELEMENTS } from './html.js';
export type { ReadableHtml, AttributeValue } from './html.js';
export { globToRegExp, matchesAny } from './glob.js';
export type { Config, Finding, Level, PresetName, Rule, ScanOptions, ScanResult, Scope } from './types.js';
