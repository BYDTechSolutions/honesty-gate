import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// test/global-setup.ts builds dist/ before this runs.
const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

const exec = (args: string[], cwd = fixtures) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('built bin (dist/cli.js)', () => {
  it('exits 0, 1 and 2', () => {
    expect(exec(['clean-next']).status).toBe(0);
    const dirty = exec(['dirty']);
    expect(dirty.status).toBe(1);
    expect(dirty.stdout).toContain('placeholders/bracket');
    const missing = exec(['nope']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Not a directory');
  });

  it('loads the example config, which imports the package by its own name', () => {
    const r = exec(['examples/sample-site', '-c', 'examples/marketing-claims.config.mjs', '-f', 'json'], root);
    expect(r.status).toBe(1);
    const ids = (JSON.parse(r.stdout).findings as Array<{ ruleId: string }>).map((f) => f.ruleId);
    expect(ids).toContain('claims/price');
  });

  it('prints GitHub annotations', () => {
    const r = exec(['dirty', '--format', 'github', '--quiet']);
    expect(r.stdout).toMatch(/^::error file=dirty\/blog\/post\.html,line=3,/);
  });
});
