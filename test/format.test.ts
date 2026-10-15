import { describe, expect, it } from 'vitest';
import { formatResult, type Finding, type ScanResult } from '../src/index';

const finding = (over: Partial<Finding>): Finding => ({
  file: 'out/index.html',
  line: 3,
  ruleId: 'placeholders/bracket',
  message: 'Unresolved [placeholder] in the copy',
  level: 'error',
  scope: 'text',
  match: '[Name]',
  context: 'Hello [Name], welcome',
  ...over,
});

const result = (findings: Finding[], files = ['out/index.html', 'out/about.html']): ScanResult => ({
  findings,
  files,
  errorCount: findings.filter((f) => f.level === 'error').length,
  warningCount: findings.filter((f) => f.level === 'warn').length,
});

describe('formatResult', () => {
  it('text: groups by file and ends with a summary', () => {
    const out = formatResult(
      result([
        finding({}),
        finding({ line: 9, level: 'warn', ruleId: 'x/alt', scope: 'attr', attribute: 'alt', context: 'alt="TODO"', message: 'Alt' }),
        finding({ file: 'out/about.html', line: 1 }),
      ]),
    );
    expect(out).toBe(
      [
        'out/index.html',
        '      3  error  Unresolved [placeholder] in the copy  placeholders/bracket (text)',
        '         Hello [Name], welcome',
        '      9  warn   Alt  x/alt (attr:alt)',
        '         alt="TODO"',
        '',
        'out/about.html',
        '      1  error  Unresolved [placeholder] in the copy  placeholders/bracket (text)',
        '         Hello [Name], welcome',
        '',
        'honesty-gate: 2 errors, 1 warning in 2 of 2 files. FAIL',
      ].join('\n'),
    );
  });

  it('text: a clean result is one line, a warnings-only result passes', () => {
    expect(formatResult(result([]))).toBe('honesty-gate: 2 files checked, no problems.');
    expect(formatResult(result([finding({ level: 'warn' })]))).toMatch(/0 errors, 1 warning in 1 of 2 files\. PASS$/);
  });

  it('json: counts and findings', () => {
    const parsed = JSON.parse(formatResult(result([finding({})]), 'json'));
    expect(parsed).toMatchObject({ files: 2, errorCount: 1, warningCount: 0 });
    expect(parsed.findings[0]).toMatchObject({ file: 'out/index.html', line: 3, ruleId: 'placeholders/bracket' });
    expect(parsed.omitted).toBeUndefined();
  });

  it('github: workflow annotations with escaped properties and data', () => {
    const out = formatResult(
      result([finding({ file: 'out/a,b:c.html', context: '100% done\nnext' }), finding({ level: 'warn', ruleId: 'r' })]),
      'github',
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe(
      '::error file=out/a%2Cb%3Ac.html,line=3,title=placeholders/bracket::Unresolved [placeholder] in the copy: 100%25 done%0Anext',
    );
    expect(lines[1]).toMatch(/^::warning file=out\/index\.html,line=3,title=r::/);
    expect(lines.at(-1)).toMatch(/^honesty-gate: 1 error, 1 warning/);
  });

  it('maxFindings keeps errors before warnings and says how many were left out', () => {
    const findings = [
      finding({ line: 1, level: 'warn', match: 'w1' }),
      finding({ line: 2, level: 'warn', match: 'w2' }),
      finding({ line: 3, level: 'error', match: 'e1' }),
    ];
    const parsed = JSON.parse(formatResult(result(findings), 'json', { maxFindings: 2 }));
    expect(parsed.findings.map((f: Finding) => f.match)).toEqual(['w1', 'e1']);
    expect(parsed.omitted).toBe(1);
    expect(formatResult(result(findings), 'text', { maxFindings: 1 })).toContain('… 2 more findings not shown (--max-findings).');
  });

  it('quiet drops warnings and prints nothing when clean', () => {
    expect(formatResult(result([finding({ level: 'warn' })]), 'text', { quiet: true })).toBe('');
    expect(formatResult(result([]), 'text', { quiet: true })).toBe('');
    const out = formatResult(result([finding({}), finding({ level: 'warn', line: 8 })]), 'text', { quiet: true });
    expect(out).not.toContain('warn ');
    expect(out).toMatch(/honesty-gate: 1 error in 1 of 2 files\. FAIL$/);
  });
});
