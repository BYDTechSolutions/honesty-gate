import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, scan, scanReport } from '../src/index';

const cwd = fileURLToPath(new URL('./fixtures/', import.meta.url));

describe('scan', () => {
  it('finds nothing in a clean Next.js-style build full of scripts, payloads and templates', async () => {
    const report = await scanReport({ cwd, dir: 'clean-next' });
    expect(report.files).toEqual(['clean-next/about/index.html', 'clean-next/index.html']);
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
  });

  it('reports every placeholder in the dirty build with file, line, scope and context', async () => {
    const findings = await scan({ cwd, dir: 'dirty' });
    const rows = findings.map((f) => [f.file, f.line, f.ruleId, f.scope, f.attribute ?? '', f.match]);
    expect(rows).toEqual([
      ['dirty/blog/post.html', 3, 'placeholders/template-syntax', 'text', '', '{{ post.title }}'],
      ['dirty/blog/post.html', 4, 'placeholders/bracket', 'text', '', '[Author]'],
      ['dirty/blog/post.html', 4, 'placeholders/template-syntax', 'text', '', '${date}'],
      ['dirty/blog/post.html', 5, 'placeholders/todo', 'attr', 'aria-label', 'TBD'],
      ['dirty/blog/post.html', 6, 'placeholders/js-value', 'text', '', '[object Object]'],
      ['dirty/index.html', 4, 'placeholders/bracket', 'text', '', '[Client name]'],
      ['dirty/index.html', 5, 'placeholders/todo', 'attr', 'content', 'TODO'],
      ['dirty/index.html', 9, 'placeholders/lorem-ipsum', 'text', '', 'Lorem ipsum'],
      ['dirty/index.html', 10, 'placeholders/bracket', 'attr', 'alt', '[Team photo]'],
      ['dirty/index.html', 11, 'placeholders/empty-href', 'raw', '', '<a href="#"'],
      ['dirty/index.html', 12, 'placeholders/bracket', 'text', '', '[nobody]'],
      ['dirty/index.html', 12, 'placeholders/js-value', 'text', '', 'NaN'],
    ]);
    expect(findings.every((f) => f.level === 'error')).toBe(true);
    expect(findings.find((f) => f.match === '[Client name]')?.context).toContain('Welcome, [Client name]');
  });

  it('include and exclude select files; plain-text files are read as text', async () => {
    const txt = await scanReport({ cwd, dir: 'dirty', include: ['*.txt'] });
    expect(txt.files).toEqual(['dirty/llms.txt']);
    // "[Docs](/docs)" is a Markdown link and passes; "[Pricing]: TODO" does not.
    expect(txt.findings.map((f) => [f.line, f.ruleId, f.match])).toEqual([
      [3, 'placeholders/bracket', '[Pricing]'],
      [3, 'placeholders/todo', 'TODO'],
    ]);
    const noBlog = await scanReport({ cwd, dir: 'dirty', exclude: ['blog/**'] });
    expect(noBlog.files).toEqual(['dirty/index.html']);
  });

  it('a rule can limit itself to some files', async () => {
    const findings = await scan({
      cwd,
      dir: 'dirty',
      extends: [],
      rules: [{ id: 'blog-only', pattern: 'Share|Hello', message: 'm', include: ['blog/**'] }],
    });
    expect(findings.map((f) => f.match)).toEqual(['Share']);
    const excluded = await scan({
      cwd,
      dir: 'dirty',
      extends: [],
      rules: [{ id: 'not-blog', pattern: 'Share|Hello', message: 'm', exclude: ['blog/**'] }],
    });
    expect(excluded.map((f) => f.match)).toEqual(['Hello']);
  });

  it('warnings are counted apart from errors', async () => {
    const report = await scanReport({ cwd, dir: 'dirty', levels: { 'placeholders/bracket': 'warn' } });
    expect(report.warningCount).toBe(4);
    expect(report.errorCount).toBe(8);
  });

  it('fails loudly on a missing directory, no directory, or no matching files', async () => {
    await expect(scan({ cwd, dir: 'does-not-exist' })).rejects.toThrow(/Not a directory/);
    await expect(scan({ cwd })).rejects.toThrow(/No directory to scan/);
    await expect(scan({ cwd, dir: 'empty' })).rejects.toThrow(ConfigError);
    await expect(scan({ cwd, dir: 'empty' })).rejects.toThrow(/No files in empty match/);
    expect(await scan({ cwd, dir: 'empty', allowEmpty: true })).toEqual([]);
  });

  it('paths are relative to cwd', async () => {
    const findings = await scan({ cwd: `${cwd}dirty`, dir: '.', include: ['index.html'] });
    expect(new Set(findings.map((f) => f.file))).toEqual(new Set(['index.html']));
  });
});
