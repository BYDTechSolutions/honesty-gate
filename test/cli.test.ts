import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from '../src/run';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

async function cli(args: string[], cwd = fixtures) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, { cwd, stdout: (t) => (stdout += `${t}\n`), stderr: (t) => (stderr += `${t}\n`) });
  return { code, stdout, stderr };
}

describe('CLI exit codes', () => {
  it('0 on a clean build', async () => {
    const r = await cli(['clean-next']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('honesty-gate: 2 files checked, no problems.\n');
  });

  it('1 on error-level findings', async () => {
    const r = await cli(['dirty']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('dirty/index.html');
    expect(r.stdout).toMatch(/12 errors, 0 warnings in 2 of 2 files\. FAIL/);
  });

  it('0 when every finding is a warning', async () => {
    const r = await cli([], `${fixtures}config-warn`);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/0 errors, 12 warnings in 2 of 2 files\. PASS/);
  });

  it('reads levels and custom rules from a discovered config; CLI include and exclude replace it', async () => {
    const r = await cli([], `${fixtures}config-json`);
    // config-json lowers empty-href to warn and turns lorem-ipsum off; other errors remain.
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('custom/share');
    expect(r.stdout).not.toContain('lorem-ipsum');
    const blog = await cli(['--include', 'blog/**', '-f', 'json'], `${fixtures}config-json`);
    expect(new Set(JSON.parse(blog.stdout).findings.map((f: { file: string }) => f.file))).toEqual(new Set(['../dirty/blog/post.html']));
  });

  it.each([
    [['--bogus'], /Unknown option '--bogus'/],
    [['a', 'b'], /expected one directory/],
    [['dirty', '--format', 'xml'], /unknown format "xml"/],
    [['dirty', '--max-findings=-1'], /--max-findings needs a whole number/],
    [['dirty', '--max-findings', 'lots'], /--max-findings needs a whole number/],
    [['missing-dir'], /Not a directory: missing-dir/],
    [[], /No directory to scan/],
    [['empty'], /No files in empty match/],
    [['dirty', '--config', 'nope.mjs'], /Config file not found/],
    [['dirty', '--config', 'x', '--no-config'], /cannot be used together/],
  ])('2 on usage or config errors: %j', async (args, message) => {
    const r = await cli(args);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(message);
    expect(r.stdout).toBe('');
  });

  it('2 on a broken or invalid config file', async () => {
    expect((await cli([], `${fixtures}config-broken`)).code).toBe(2);
    expect((await cli([], `${fixtures}config-bad-rule`)).code).toBe(2);
  });

  it('--allow-empty passes an empty match', async () => {
    expect((await cli(['empty', '--allow-empty'])).code).toBe(0);
  });
});

describe('CLI options', () => {
  it('--format json', async () => {
    const r = await cli(['dirty', '-f', 'json']);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.errorCount).toBe(12);
    expect(parsed.findings).toHaveLength(12);
  });

  it('--format github', async () => {
    const r = await cli(['dirty', '--format', 'github']);
    expect(r.stdout.split('\n')[0]).toBe(
      '::error file=dirty/blog/post.html,line=3,title=placeholders/template-syntax::Unrendered template expression ({{ }}, {%25 %25} or ${ }): {{ post.title }} By [Author] on ${date} Share [object Ob…',
    );
  });

  it('--max-findings caps output but not the exit code', async () => {
    const r = await cli(['dirty', '--max-findings', '0']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('12 more findings not shown');
  });

  it('--quiet prints nothing for a clean build', async () => {
    const r = await cli(['clean-next', '-q']);
    expect(r).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('a positional dir overrides the config; --config loads a file', async () => {
    const r = await cli(['examples/sample-site', '--config', 'examples/marketing-claims.config.mjs'], root);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('claims/price');
    expect(r.stdout).toContain('claims/timeline');
  });

  it('--list-rules prints the resolved rules', async () => {
    const r = await cli(['--list-rules'], `${fixtures}config-json`);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^warn +placeholders\/empty-href +raw/m);
    expect(r.stdout).toMatch(/^warn +custom\/share +text/m);
    expect(r.stdout).not.toContain('lorem-ipsum');
  });

  it('--help and --version', async () => {
    expect((await cli(['--help'])).stdout).toContain('Usage: honesty-gate [dir] [options]');
    const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { version: string };
    expect((await cli(['-v'])).stdout.trim()).toBe(pkg.version);
  });
});
