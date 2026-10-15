import type { PresetName, Rule } from './types.js';

/**
 * `placeholders`: copy that was never finished, or a template value that never
 * resolved. On by default.
 *
 * Tuned for few false positives:
 * - `bracket` needs a letter first, so citation marks (`[1]`, `[12, 14]`) and
 *   ellipses (`[…]`) pass. A single lowercase letter (`[a]`, a footnote) passes;
 *   a single capital (`[X]`) is a classic stand-in and fails. A bracket right
 *   after a letter, digit or closing bracket (`items[index]`, `matrix[i][j]`)
 *   reads as code and passes, as does a Markdown link (`[docs](/docs)`) and
 *   the editorial `[sic]`.
 * - `todo` is case-sensitive: "TODO" fails, a "todo app" does not.
 * - `js-value` is case-sensitive and whole-word: "Undefined" in a heading
 *   passes; a lone "undefined" or "NaN" where a value should be fails.
 */
export const placeholders: readonly Rule[] = Object.freeze([
  {
    id: 'placeholders/bracket',
    pattern: /(?<![\p{L}\p{N}_\])])\[(?!sic\]|object Object\])(?:[A-Z]|\p{L}[^[\]\n]{1,60})\](?![([])/gu,
    message: 'Unresolved [placeholder] in the copy',
    scope: 'all',
    level: 'error',
  },
  {
    id: 'placeholders/lorem-ipsum',
    pattern: /\blorem ipsum\b/gi,
    message: 'Lorem ipsum filler text',
    scope: 'all',
    level: 'error',
  },
  {
    id: 'placeholders/todo',
    pattern: /\b(?:TODO|TBD|FIXME)\b/g,
    message: 'TODO, TBD or FIXME left in the copy',
    scope: 'all',
    level: 'error',
  },
  {
    id: 'placeholders/template-syntax',
    pattern: /\{\{[^{}\n]{0,80}\}\}|\{%[^\n]{0,80}?%\}|\$\{[A-Za-z_$][\w$.]{0,60}\}/g,
    message: 'Unrendered template expression ({{ }}, {% %} or ${ })',
    scope: 'all',
    level: 'error',
  },
  {
    id: 'placeholders/js-value',
    pattern: /\[object Object\]|\bundefined\b|\bNaN\b/g,
    message: 'A JavaScript value that never resolved (undefined, NaN, [object Object])',
    scope: 'all',
    level: 'error',
  },
  {
    id: 'placeholders/empty-href',
    // Raw markup: the attr scope reads values, and "#" alone says nothing
    // without knowing it is a link target.
    pattern: /<a\b[^>]*?\shref\s*=\s*(?:"#"|'#'|#(?=[\s>]))/gi,
    message: 'Link with href="#" goes nowhere',
    scope: 'raw',
    level: 'error',
  },
]);

/** Built-in presets, by name. */
export const presets: Readonly<Record<PresetName, readonly Rule[]>> = Object.freeze({ placeholders });
