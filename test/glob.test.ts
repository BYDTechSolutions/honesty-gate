import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAny } from '../src/index';

const m = (glob: string, path: string) => globToRegExp(glob).test(path);

describe('glob matcher', () => {
  it('** matches any depth, including none', () => {
    expect(m('**/*.html', 'index.html')).toBe(true);
    expect(m('**/*.html', 'a/b/c/index.html')).toBe(true);
    expect(m('blog/**', 'blog/a/b.html')).toBe(true);
    expect(m('a/**/z.html', 'a/z.html')).toBe(true);
    expect(m('a/**/z.html', 'a/b/c/z.html')).toBe(true);
  });

  it('* and ? stay inside one segment', () => {
    expect(m('blog/*.html', 'blog/post.html')).toBe(true);
    expect(m('blog/*.html', 'blog/2026/post.html')).toBe(false);
    expect(m('page?.html', 'page1.html')).toBe(true);
    expect(m('page?.html', 'page10.html')).toBe(false);
  });

  it('a pattern without a slash matches the file name at any depth', () => {
    expect(m('*.txt', 'llms.txt')).toBe(true);
    expect(m('*.txt', 'deep/robots.txt')).toBe(true);
    expect(m('404.html', 'nested/404.html')).toBe(true);
  });

  it('supports braces, nested braces and classes', () => {
    expect(m('**/*.{html,htm}', 'a/b.htm')).toBe(true);
    expect(m('**/*.{txt,{xml,json}.body}', 'sitemap.xml.body')).toBe(true);
    expect(m('v[0-9].html', 'v2.html')).toBe(true);
    expect(m('v[!0-9].html', 'v2.html')).toBe(false);
  });

  it('escapes regex characters and strips a leading ./', () => {
    expect(m('a+b(1).html', 'a+b(1).html')).toBe(true);
    expect(m('a.html', 'aXhtml')).toBe(false);
    expect(m('./out/*.html', 'out/x.html')).toBe(true);
  });

  it('matches dot directories', () => {
    expect(m('**/node_modules/**', '.next/node_modules/x/index.html')).toBe(true);
  });

  it('matchesAny', () => {
    expect(matchesAny('a/b.html', ['*.txt', 'a/*'])).toBe(true);
    expect(matchesAny('a/b.html', [])).toBe(false);
  });
});
