/**
 * Reading built HTML the way a reader meets it: the painted text, and the
 * attribute values a person sees or hears (alt text, tooltips, ARIA labels,
 * link targets, the page description).
 *
 * This is a regex tokenizer, not an HTML parser. It handles the output of
 * static-site generators and framework builds well because that markup is
 * machine-written and well-formed; it does not implement the HTML5 error
 * recovery rules, and it does not run CSS, so text hidden with `display:none`
 * or the `hidden` attribute still counts as text.
 */

/** Elements whose content never paints as text: removed with everything inside. */
export const SKIPPED_ELEMENTS = ['script', 'style', 'template', 'noscript'] as const;

/**
 * Generic attributes whose values a person reads or hears. Used for the
 * `attr` scope unless a config sets `attributes`.
 */
export const DEFAULT_ATTRIBUTES = [
  'alt',
  'title',
  'placeholder',
  'label',
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-placeholder',
  'aria-valuetext',
] as const;

/**
 * Inline elements: a tag boundary between two of these does not separate
 * words (`<b>Lo</b>rem` reads as "Lorem"). Every other tag reads as a space.
 */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins',
  'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub',
  'sup', 'time', 'tt', 'u', 'var',
]);

/** `<meta name|property>` values whose `content` is copy a person reads (search results, link previews). */
const HUMAN_META =
  /^(?:description|keywords|author|application-name|apple-mobile-web-app-title|(?:og|twitter):(?:title|description|site_name|image:alt))$/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', middot: '·',
  times: '×', divide: '÷', minus: '−', plusmn: '±', deg: '°', micro: 'µ',
  para: '¶', sect: '§', dagger: '†', Dagger: '‡', permil: '‰', prime: '′',
  euro: '€', pound: '£', yen: '¥', cent: '¢', curren: '¤',
  iexcl: '¡', iquest: '¿', shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²',
  sup3: '³', ordf: 'ª', ordm: 'º', not: '¬', macr: '¯', acute: '´',
  cedil: '¸', uml: '¨', szlig: 'ß', aacute: 'á', eacute: 'é', iacute: 'í',
  oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è', ntilde: 'ñ',
  ccedil: 'ç', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö',
  Uuml: 'Ü', Eacute: 'É', check: '✓', star: '☆', hearts: '♥',
};

/**
 * Decode named (the common set) and numeric HTML character references.
 * Unknown named references are left as written.
 */
export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input;
  return input.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));?/g, (whole, dec, hex, name) => {
    if (dec !== undefined || hex !== undefined) {
      const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    const value = NAMED_ENTITIES[name as string];
    // A named reference without its semicolon is only honored for the
    // legacy few; anything else ("&copy2026") stays literal.
    if (value === undefined) return whole;
    if (!whole.endsWith(';') && !['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg'].includes(name)) return whole;
    return value;
  });
}

/** Characters that take no space on screen: removed so they cannot split a word. */
const INVISIBLE = /[­​⁠﻿]/g;

function normalizeText(s: string): string {
  return decodeEntities(s).replace(INVISIBLE, '').replace(/\s+/g, ' ');
}

/** One attribute value a person reads, with where it came from. */
export interface AttributeValue {
  /** Lowercased element name, e.g. `img`. */
  tag: string;
  /** Lowercased attribute name, e.g. `alt`. */
  name: string;
  /** Decoded value. */
  value: string;
  /** Offset of the value in the source. */
  offset: number;
}

/** What {@link readHtml} returns. */
export interface ReadableHtml {
  /** Visible text with entities decoded and whitespace collapsed. */
  text: string;
  /**
   * Maps text offsets back to source offsets: each entry is `[textOffset,
   * sourceOffset]`, ascending. A text offset belongs to the last entry at or
   * before it.
   */
  textMap: Array<[number, number]>;
  /** Human-facing attribute values, in source order. */
  attributes: AttributeValue[];
}

const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Split built HTML into visible text and human-facing attribute values.
 *
 * Removed before reading: comments, CDATA, doctype, processing instructions,
 * and the full content of `<script>`, `<style>`, `<template>` and
 * `<noscript>` — which is where framework payloads (Next.js RSC, JSON-LD,
 * hydration state, island props) live.
 *
 * @param html - The document source.
 * @param attributeNames - Generic attribute names to collect (lowercase).
 */
export function readHtml(html: string, attributeNames: readonly string[] = DEFAULT_ATTRIBUTES): ReadableHtml {
  const wanted = new Set(attributeNames.map((a) => a.toLowerCase()));
  let text = '';
  const textMap: Array<[number, number]> = [];
  const attributes: AttributeValue[] = [];

  const separate = () => {
    if (text.length && !text.endsWith(' ')) text += ' ';
  };
  const appendText = (raw: string, offset: number) => {
    // One piece per source line keeps the line number of a match exact.
    let lineStart = 0;
    for (const line of raw.split('\n')) {
      const piece = normalizeText(line);
      const at = offset + lineStart;
      lineStart += line.length + 1;
      if (!piece) continue;
      const trimmed = text.endsWith(' ') && piece.startsWith(' ') ? piece.slice(1) : piece;
      if (!trimmed) continue;
      textMap.push([text.length, at]);
      text += trimmed;
    }
  };

  TOKEN.lastIndex = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html))) {
    if (m.index > cursor) appendText(html.slice(cursor, m.index), cursor);
    cursor = TOKEN.lastIndex;
    const name = m[2]?.toLowerCase();
    if (!name) {
      separate();
      continue;
    }
    const closing = m[1] === '/';
    if (!INLINE.has(name)) separate();
    if (closing) continue;

    if ((SKIPPED_ELEMENTS as readonly string[]).includes(name)) {
      cursor = skipElement(html, name, cursor);
      TOKEN.lastIndex = cursor;
      separate();
      continue;
    }

    const attrSource = m[3];
    if (!attrSource) continue;
    const attrOffset = m.index + 1 + m[2]!.length;
    const parsed: Array<{ name: string; value: string; offset: number }> = [];
    ATTR.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR.exec(attrSource))) {
      const value = a[2] ?? a[3] ?? a[4];
      if (value === undefined) continue;
      const valueAt = a.index + a[0].length - value.length - (a[2] !== undefined || a[3] !== undefined ? 1 : 0);
      parsed.push({ name: a[1]!.toLowerCase(), value, offset: attrOffset + valueAt });
    }
    const get = (n: string) => parsed.find((p) => p.name === n)?.value;
    for (const p of parsed) {
      let keep = wanted.has(p.name);
      if (p.name === 'href' && (name === 'a' || name === 'area')) keep = true;
      if (p.name === 'value' && name === 'input' && /^(?:submit|button|reset)$/i.test(get('type') ?? '')) keep = true;
      if (p.name === 'content' && name === 'meta' && HUMAN_META.test(get('name') ?? get('property') ?? '')) keep = true;
      if (!keep) continue;
      const value = decodeEntities(p.value).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
      if (value) attributes.push({ tag: name, name: p.name, value, offset: p.offset });
    }
  }
  if (cursor < html.length) appendText(html.slice(cursor), cursor);

  return { text: text.trim() === '' ? '' : text, textMap, attributes };
}

/** Return the offset just past the element's end tag (or the end of input). Nested `<template>`s are counted. */
function skipElement(html: string, name: string, from: number): number {
  const close = new RegExp(`<(/?)${name}(?=[\\s/>])[^>]*>`, 'gi');
  close.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = close.exec(html))) {
    if (m[1] === '/') depth--;
    else if (name === 'template') depth++;
    if (depth === 0) return close.lastIndex;
  }
  return html.length;
}

/** Precomputed line starts for offset → 1-based line lookups. */
export function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Source offset for a text offset, using a {@link ReadableHtml.textMap}. */
export function textToSource(textMap: ReadableHtml['textMap'], textOffset: number): number {
  let lo = 0;
  let hi = textMap.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textMap[mid]![0] <= textOffset) lo = mid;
    else hi = mid - 1;
  }
  const [t, s] = textMap[lo]!;
  return s + Math.max(0, textOffset - t);
}
