/**
 * Where a rule looks.
 *
 * - `text`: the visible text of the page — tags, comments, and the content of
 *   `<script>`, `<style>`, `<template>` and `<noscript>` removed, entities
 *   decoded, whitespace collapsed.
 * - `attr`: attribute values a person reads or hears: `alt`, `title`,
 *   `placeholder`, `aria-label` and friends, `href` on links, the `value` of
 *   button inputs, and `content` of description/Open Graph/Twitter `<meta>`.
 *   Each value is matched on its own.
 * - `raw`: the file exactly as written, markup and scripts included. For
 *   problems that live in markup (`href="#"`) or content serialized to the
 *   browser without being painted.
 * - `all`: shorthand for `text` and `attr` — every surface a person sees.
 *   It never includes `raw`, which contains the text again and would report
 *   every hit twice.
 */
export type Scope = 'text' | 'attr' | 'raw' | 'all';

/** `error` fails the gate (exit code 1); `warn` is reported and passes. */
export type Level = 'error' | 'warn';

/** One check. */
export interface Rule {
  /** Unique id, shown in output, e.g. `placeholders/bracket` or `claims/price`. */
  id: string;
  /**
   * What to look for. A string is a regular expression source (as in a JSON
   * config), not a literal: escape `. * + ? ( ) [ ] { } | \ ^ $` to match them.
   * The `g` flag is always added.
   */
  pattern: string | RegExp;
  /** Flags for a string `pattern`, e.g. `"i"`. Ignored for a RegExp. */
  flags?: string;
  /** What a finding means, in words a reviewer understands. */
  message: string;
  /** Where to look. Default `all` (visible text and attribute values). An array combines scopes. */
  scope?: Scope | Scope[];
  /** Default `error`. */
  level?: Level;
  /** Only check files matching these globs (relative to the scanned directory). Default: every scanned file. */
  include?: string[];
  /** Skip files matching these globs. */
  exclude?: string[];
}

/** Names of the built-in presets. */
export type PresetName = 'placeholders';

/** The config file's shape, and the options shared with {@link ScanOptions}. */
export interface Config {
  /** Directory of built output to scan, relative to `cwd`. */
  dir?: string;
  /** Files to scan, as globs relative to `dir`. Default `["**\/*.html", "**\/*.htm"]`. */
  include?: string[];
  /** Files to skip. Default `["**\/node_modules/**"]`. */
  exclude?: string[];
  /** Built-in presets to start from. Default `["placeholders"]`; `[]` turns them all off. */
  extends?: PresetName[];
  /** Your own rules. A rule whose `id` matches a preset rule replaces it. */
  rules?: Rule[];
  /** Change a rule's level by id, or turn it `off`. */
  levels?: Record<string, Level | 'off'>;
  /**
   * Generic attribute names read by the `attr` scope. Default: `alt`,
   * `title`, `placeholder`, `label`, `aria-label`, `aria-description`,
   * `aria-roledescription`, `aria-placeholder`, `aria-valuetext`. Link
   * `href`, button `value` and description `<meta content>` are always read.
   */
  attributes?: string[];
  /** Pass (instead of failing with a usage error) when no file matches. Default `false`. */
  allowEmpty?: boolean;
}

/** Options for {@link scan}. */
export interface ScanOptions extends Config {
  /** Base for `dir` and for the paths in findings. Default `process.cwd()`. */
  cwd?: string;
}

/** One problem found on one page. */
export interface Finding {
  /** Path of the file, relative to `cwd`, with `/` separators. */
  file: string;
  /** 1-based line in the source file where the match starts. */
  line: number;
  ruleId: string;
  message: string;
  level: Level;
  /** Which view of the file matched. */
  scope: 'text' | 'attr' | 'raw';
  /** For the `attr` scope: the attribute name, e.g. `alt`. */
  attribute?: string;
  /** The matched text. */
  match: string;
  /** The match with up to 40 characters either side, on one line. */
  context: string;
}

/** Result of {@link scan}, with counts. */
export interface ScanResult {
  findings: Finding[];
  /** Files scanned, relative to `cwd`. */
  files: string[];
  errorCount: number;
  warningCount: number;
}
