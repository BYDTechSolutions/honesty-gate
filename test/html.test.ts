import { describe, expect, it } from 'vitest';
import { decodeEntities, readHtml } from '../src/index';
import { lineIndex, textToSource } from '../src/html';

describe('decodeEntities', () => {
  it('decodes common named references', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot; &apos;x&apos; &mdash; &hellip; &copy;')).toBe(
      'Tom & Jerry <3 "hi" \'x\' — … ©',
    );
  });

  it('decodes punctuation a template might encode', () => {
    expect(decodeEntities('&lbrack;Name&rbrack; &lcub;&lcub; x &rcub;&rcub; &dollar;5')).toBe('[Name] {{ x }} $5');
  });

  it('decodes decimal and hex numeric references', () => {
    expect(decodeEntities('&#91;Name&#93; &#x5B;X&#x5d; &#128512;')).toBe('[Name] [X] \u{1F600}');
  });

  it('replaces invalid code points instead of throwing', () => {
    expect(decodeEntities('&#0; &#xD800; &#x110000;')).toBe('� � �');
  });

  it('leaves unknown names, and non-legacy names without a semicolon, as written', () => {
    expect(decodeEntities('&bogus; &hellip &amp &copy 2026')).toBe('&bogus; &hellip & © 2026');
  });

  it('returns the input untouched when there is no ampersand', () => {
    expect(decodeEntities('plain [text]')).toBe('plain [text]');
  });
});

describe('readHtml: visible text', () => {
  it('removes script, style, template, noscript, comments and CDATA', () => {
    const { text } = readHtml(
      '<p>one</p><script>two</script><style>.three{}</style><template>four</template>' +
        '<noscript>five</noscript><!-- six --><![CDATA[seven]]><p>eight</p>',
    );
    expect(text.trim()).toBe('one eight');
  });

  it('handles uppercase tags, attributes on skipped elements and unclosed scripts', () => {
    expect(readHtml('<P>a</P><SCRIPT type="module">b</SCRIPT><p>c</p>').text.trim()).toBe('a c');
    expect(readHtml('<p>a</p><script>never closed [x]').text.trim()).toBe('a');
  });

  it('counts nested templates', () => {
    const { text } = readHtml('<template>a<template>b</template>c</template><p>d</p>');
    expect(text.trim()).toBe('d');
  });

  it('does not end a script at a look-alike tag name', () => {
    const { text } = readHtml('<script>var a = "</scripts>";</script><p>ok</p>');
    expect(text.trim()).toBe('ok');
  });

  it('joins inline elements without a space and separates block elements', () => {
    expect(readHtml('<p>Lo<b>rem</b> <i>ip</i>sum</p><p>next</p>').text.trim()).toBe('Lorem ipsum next');
    expect(readHtml('<li>one</li><li>two</li>').text.trim()).toBe('one two');
  });

  it('decodes entities and collapses whitespace, including nbsp', () => {
    expect(readHtml('<p>a&nbsp;&nbsp;b\n\n   c &amp; d</p>').text.trim()).toBe('a b c & d');
  });

  it('drops soft hyphens and zero-width spaces that would split a word', () => {
    expect(readHtml('<p>lo&shy;rem ip​sum</p>').text.trim()).toBe('lorem ipsum');
  });

  it('keeps title text and a quoted ">" inside an attribute does not end the tag', () => {
    expect(readHtml('<title>Page</title><a title="a > b" href="/x">link</a>').text.trim()).toBe('Page link');
  });

  it('treats a stray "<" as text', () => {
    expect(readHtml('<p>1 < 2 and 3 <4</p>').text.trim()).toBe('1 < 2 and 3 <4');
  });
});

describe('readHtml: attributes', () => {
  const html = [
    '<meta name="description" content="Desc">',
    '<meta property="og:title" content="OG">',
    '<meta name="viewport" content="width=device-width">',
    '<link rel="preload" href="/[slug]/page.js">',
    '<img src="/a[1].png" alt="Alt text">',
    "<abbr title='Single quoted'>x</abbr>",
    '<input placeholder=Unquoted>',
    '<input type="submit" value="Send">',
    '<input type="text" value="typed">',
    '<button aria-label="Close &amp; exit">x</button>',
    '<a href="/about">About</a>',
    '<div data-props="{&quot;a&quot;:[1]}" class="[x]"></div>',
    '<script src="/x.js" title="in script"></script>',
  ].join('\n');
  const { attributes } = readHtml(html);
  const pairs = attributes.map((a) => `${a.tag}.${a.name}=${a.value}`);

  it('collects the values a person reads', () => {
    expect(pairs).toEqual([
      'meta.content=Desc',
      'meta.content=OG',
      'img.alt=Alt text',
      'abbr.title=Single quoted',
      'input.placeholder=Unquoted',
      'input.value=Send',
      'button.aria-label=Close & exit',
      'a.href=/about',
    ]);
  });

  it('skips resource URLs, data attributes, classes, viewport meta, text input values and script attributes', () => {
    expect(pairs.join(' ')).not.toMatch(/slug|a\[1\]|data-props|\[x\]|width=|typed|in script/);
  });

  it('records the source offset of each value', () => {
    const alt = attributes.find((a) => a.name === 'alt')!;
    expect(html.slice(alt.offset, alt.offset + alt.value.length)).toBe('Alt text');
    const placeholder = attributes.find((a) => a.name === 'placeholder')!;
    expect(html.slice(placeholder.offset, placeholder.offset + 8)).toBe('Unquoted');
  });

  it('reads a custom attribute list', () => {
    const custom = readHtml('<img alt="a" data-caption="cap">', ['data-caption']).attributes;
    expect(custom.map((a) => a.name)).toEqual(['data-caption']);
  });
});

describe('line mapping', () => {
  it('maps text offsets back to exact source lines', () => {
    const html = '<html>\n<body>\n<p>first\nsecond &amp; [here]</p>\n</body>';
    const r = readHtml(html);
    const lineOf = lineIndex(html);
    const at = r.text.indexOf('[here]');
    expect(lineOf(textToSource(r.textMap, at))).toBe(4);
    expect(lineOf(textToSource(r.textMap, r.text.indexOf('first')))).toBe(3);
  });

  it('lineIndex is 1-based', () => {
    const lineOf = lineIndex('a\nb\nc');
    expect([lineOf(0), lineOf(2), lineOf(4)]).toEqual([1, 2, 3]);
  });
});
