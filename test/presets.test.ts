import { describe, expect, it } from 'vitest';
import { checkSource, presets, resolveRules } from '../src/index';

const rules = resolveRules({});
const ids = (html: string) => checkSource(html, 'page.html', rules).map((f) => f.ruleId);
const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`;

describe('placeholders preset', () => {
  it('is the default and has the documented rules', () => {
    expect(presets.placeholders.map((r) => r.id)).toEqual([
      'placeholders/bracket',
      'placeholders/lorem-ipsum',
      'placeholders/todo',
      'placeholders/template-syntax',
      'placeholders/js-value',
      'placeholders/empty-href',
    ]);
    expect(rules.map((r) => r.id)).toEqual(presets.placeholders.map((r) => r.id));
  });

  describe('bracket', () => {
    it.each(['Hello [Client name],', 'Most MVPs: $[X]-$[Y]', '[TBD]', 'email: hello@[domain]', '([Company])', '[über]'])(
      'flags %s',
      (text) => {
        expect(ids(page(`<p>${text}</p>`))).toContain('placeholders/bracket');
      },
    );

    it.each([
      ['a numeric footnote', 'Claim.<sup>[1]</sup>'],
      ['a citation list', 'Shown in [2, 3].'],
      ['an ellipsis', 'He said […] later.'],
      ['a lowercase single-letter note', 'See note [a].'],
      ['code-style indexing', 'Use items[index] or matrix[i][j].'],
      ['a Markdown link', 'Read the [docs](/docs).'],
      ['a reference link', 'See [docs][1].'],
      ['the editorial sic', 'They wrote "teh" [sic].'],
      ['an over-long bracket', `[${'a'.repeat(80)}]`],
    ])('passes %s', (_, text) => {
      expect(ids(page(`<p>${text}</p>`))).not.toContain('placeholders/bracket');
    });
  });

  it('lorem-ipsum is case-insensitive', () => {
    expect(ids(page('<p>LOREM IPSUM dolor</p>'))).toEqual(['placeholders/lorem-ipsum']);
  });

  it('todo is case-sensitive and whole-word', () => {
    expect(ids(page('<p>TODO: finish</p><p>Date: TBD</p><p>FIXME</p>'))).toEqual([
      'placeholders/todo',
      'placeholders/todo',
      'placeholders/todo',
    ]);
    expect(ids(page('<p>A todo app. TODOS. Tbd.</p>'))).toEqual([]);
  });

  it('template-syntax catches mustache, Liquid/Jinja and template literals', () => {
    expect(ids(page('<h1>{{ post.title }}</h1>'))).toEqual(['placeholders/template-syntax']);
    expect(ids(page('<p>{% if user %}</p>'))).toEqual(['placeholders/template-syntax']);
    expect(ids(page('<p>Posted ${date}</p>'))).toEqual(['placeholders/template-syntax']);
    expect(ids(page('<p>Costs {5} and ${ not a var }</p>'))).toEqual([]);
  });

  it('js-value catches unresolved values but not the capitalized word', () => {
    expect(ids(page('<p>Hello undefined</p><p>NaN items</p><p>[object Object]</p>'))).toEqual([
      'placeholders/js-value',
      'placeholders/js-value',
      'placeholders/js-value',
    ]);
    expect(ids(page('<h2>Undefined behavior</h2><p>Nanny, banana</p>'))).toEqual([]);
  });

  describe('empty-href (raw)', () => {
    it.each(['<a href="#">x</a>', "<a class='b' href='#'>x</a>", '<a href=#>x</a>', '<A HREF="#">x</A>'])('flags %s', (html) => {
      expect(ids(page(html))).toEqual(['placeholders/empty-href']);
    });

    it.each(['<a href="#main">Skip</a>', '<link rel="x" href="#">', '<a data-href="#" href="/x">x</a>'])('passes %s', (html) => {
      expect(ids(page(html))).toEqual([]);
    });
  });
});

describe('scopes', () => {
  it('text ignores scripts and framework payloads that a naive grep would flag', () => {
    const html = page(
      `<p>Clean copy.</p>
       <script>$$('[data-log]').forEach(e => e.textContent = String(undefined)); const t = \`\${name}\`;</script>
       <script>self.__next_f.push([1,"[\\"$\\",\\"p\\",null,{\\"children\\":\\"TODO [placeholder] lorem ipsum\\"}]"])</script>
       <script type="application/ld+json">{"name":"[Org name]","description":"TBD"}</script>
       <style>[data-theme="dark"]{color:red}</style>`,
    );
    expect(ids(html)).toEqual([]);
  });

  it('attr reads alt/title/aria and reports the attribute name', () => {
    const findings = checkSource(page('<img src="/x.png" alt="[Team photo]"><button aria-label="TODO">x</button>'), 'p.html', rules);
    expect(findings.map((f) => [f.ruleId, f.scope, f.attribute])).toEqual([
      ['placeholders/bracket', 'attr', 'alt'],
      ['placeholders/todo', 'attr', 'aria-label'],
    ]);
    expect(findings[0]!.context).toBe('alt="[Team photo]"');
  });

  it('raw sees what text cannot: comments and serialized payloads', () => {
    const html = page('<!-- [Client name] --><script>window.__DATA__={"draft":"DEMO RECORD"}</script>');
    const raw = resolveRules({ extends: [], rules: [{ id: 'demo', pattern: 'DEMO RECORD|\\[Client name\\]', message: 'leak', scope: 'raw' }] });
    const text = resolveRules({ extends: [], rules: [{ id: 'demo', pattern: 'DEMO RECORD|\\[Client name\\]', message: 'leak', scope: 'all' }] });
    expect(checkSource(html, 'p.html', raw)).toHaveLength(2);
    expect(checkSource(html, 'p.html', text)).toHaveLength(0);
  });

  it('a scope array combines views', () => {
    const r = resolveRules({ extends: [], rules: [{ id: 'x', pattern: 'X1', message: 'm', scope: ['text', 'raw'] }] });
    const findings = checkSource(page('<p>X1</p>'), 'p.html', r);
    expect(findings.map((f) => f.scope).sort()).toEqual(['raw', 'text']);
  });

  it('entity-encoded copy is decoded before matching', () => {
    expect(ids(page('<p>For &lbrack;nobody&rbrack; and &#91;Name&#93;</p>'))).toEqual(['placeholders/bracket', 'placeholders/bracket']);
  });

  it('plain-text files are read once, with no attributes', () => {
    const r = resolveRules({ extends: [], rules: [{ id: 'x', pattern: 'TODO', message: 'm', scope: ['text', 'attr', 'raw'] }] });
    const findings = checkSource('line one\nTODO here', 'llms.txt', r, false);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 2, scope: 'text', match: 'TODO' });
  });

  it('skips empty matches', () => {
    const r = resolveRules({ extends: [], rules: [{ id: 'x', pattern: 'z*', message: 'm' }] });
    expect(checkSource(page('<p>abc</p>'), 'p.html', r)).toEqual([]);
  });
});
