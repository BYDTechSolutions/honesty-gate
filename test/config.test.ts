import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, checkSource, defineConfig, loadConfig, resolveRules, scan } from '../src/index';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

describe('loadConfig', () => {
  it('returns an empty config when there is no file', async () => {
    expect(await loadConfig({ cwd: `${fixtures}empty` })).toEqual({ config: {} });
  });

  it('discovers honesty-gate.config.json', async () => {
    const { config, path } = await loadConfig({ cwd: `${fixtures}config-json` });
    expect(path).toMatch(/config-json\/honesty-gate\.config\.json$/);
    expect(config.dir).toBe('../dirty');
  });

  it('prefers .mjs over .json', async () => {
    const { config, path } = await loadConfig({ cwd: `${fixtures}config-mjs` });
    expect(path).toMatch(/\.mjs$/);
    expect(config.extends).toEqual([]);
    expect(config.rules?.[0]?.pattern).toBeInstanceOf(RegExp);
  });

  it('loads an explicit path relative to cwd', async () => {
    const { config } = await loadConfig({ cwd: root, path: 'examples/basic.config.json' });
    expect(config.dir).toBe('dist');
  });

  it('throws ConfigError for a missing explicit path, broken JSON, or a bad rule', async () => {
    await expect(loadConfig({ cwd: root, path: 'nope.json' })).rejects.toThrow(ConfigError);
    await expect(loadConfig({ cwd: `${fixtures}config-broken` })).rejects.toThrow(/Could not load/);
    await expect(loadConfig({ cwd: `${fixtures}config-bad-rule` })).rejects.toThrow(/invalid pattern/);
  });
});

describe('validation', () => {
  const bad = (options: object) => scan({ dir: `${fixtures}dirty`, ...options } as never);

  it.each([
    [{ colour: 'red' }, /unknown option "colour"/],
    [{ include: 'x' }, /"include" must be an array/],
    [{ extends: ['nope'] }, /unknown preset "nope"/],
    [{ levels: { 'placeholders/todo': 'loud' } }, /must be "error", "warn" or "off"/],
    [{ levels: { 'no/such-rule': 'off' } }, /does not exist/],
    [{ rules: [{ id: 'x', pattern: 'a' }] }, /needs a "message"/],
    [{ rules: [{ pattern: 'a', message: 'm' }] }, /needs an "id"/],
    [{ rules: [{ id: 'x', pattern: 'a', message: 'm', scope: 'html' }] }, /unknown scope "html"/],
    [{ rules: [{ id: 'x', pattern: 'a', message: 'm', level: 'fatal' }] }, /"level" must be/],
    [{ rules: [{ id: 'x', pattern: 5, message: 'm' }] }, /must be a string or a RegExp/],
    [{ allowEmpty: 'yes' }, /"allowEmpty" must be true or false/],
  ])('rejects %j', async (options, message) => {
    await expect(bad(options)).rejects.toThrow(message);
  });
});

describe('resolveRules', () => {
  it('extends [] turns presets off', () => {
    expect(resolveRules({ extends: [] })).toEqual([]);
  });

  it('levels can lower or switch off a rule', () => {
    const rules = resolveRules({ levels: { 'placeholders/todo': 'warn', 'placeholders/bracket': 'off' } });
    expect(rules.find((r) => r.id === 'placeholders/todo')?.level).toBe('warn');
    expect(rules.some((r) => r.id === 'placeholders/bracket')).toBe(false);
  });

  it('a custom rule with a preset id replaces it', () => {
    const rules = resolveRules({ rules: [{ id: 'placeholders/todo', pattern: 'WIP', message: 'WIP left in', level: 'warn' }] });
    const todo = rules.filter((r) => r.id === 'placeholders/todo');
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ message: 'WIP left in', level: 'warn' });
  });

  it('string patterns take flags, always get g, and scope defaults to text + attr', () => {
    const [rule] = resolveRules({ extends: [], rules: [{ id: 'x', pattern: 'hello', flags: 'iy', message: 'm' }] });
    expect(rule!.regex.flags).toBe('gi');
    expect(rule!.scopes).toEqual(['text', 'attr']);
  });

  it('a RegExp without g still finds every match', () => {
    const rules = resolveRules({ extends: [], rules: [{ id: 'x', pattern: /a/, message: 'm' }] });
    expect(checkSource('<p>a a a</p>', 'p.html', rules)).toHaveLength(3);
  });

  it('defineConfig returns its argument', () => {
    const config = { dir: 'out' };
    expect(defineConfig(config)).toBe(config);
  });
});

describe('examples/marketing-claims.config.mjs', () => {
  it('loads and catches every claim in the sample site', async () => {
    const { config } = await loadConfig({ cwd: root, path: 'examples/marketing-claims.config.mjs' });
    const findings = await scan({ ...config, cwd: root, dir: 'examples/sample-site' });
    expect(findings.map((f) => `${f.file}:${f.ruleId}`).sort()).toEqual(
      [
        'examples/sample-site/index.html:claims/demo-cadence',
        'examples/sample-site/index.html:claims/timeline',
        'examples/sample-site/index.html:placeholders/bracket',
        'examples/sample-site/services/index.html:claims/price',
        'examples/sample-site/services/index.html:placeholders/empty-href',
        'examples/sample-site/services/index.html:placeholders/todo',
      ].sort(),
    );
  });

  it('flags each kind of claim and passes ordinary copy', async () => {
    const { config } = await loadConfig({ cwd: root, path: 'examples/marketing-claims.config.mjs' });
    const rules = resolveRules({ ...config, extends: [] });
    const hit = (text: string) => checkSource(`<p>${text}</p>`, 'p.html', rules).map((f) => f.ruleId);
    expect(hit('Demos every Friday.')).toEqual(['claims/demo-cadence']);
    expect(hit('We send weekly updates.')).toEqual(['claims/demo-cadence']);
    expect(hit('A fixed-price quote.')).toEqual(['claims/fixed-price']);
    expect(hit('We reply within one business day.')).toEqual(['claims/reply-time']);
    expect(hit('Expect a response within 24 hours.')).toEqual(['claims/reply-time']);
    expect(hit('From $5k, or €900, or 400 USD.')).toEqual(['claims/price', 'claims/price', 'claims/price']);
    expect(hit('Ships in 4-6 weeks.')).toEqual(['claims/timeline']);
    expect(hit('Week 1: discovery.')).toEqual(['claims/timeline']);
    expect(hit('Launch in six weeks.')).toEqual(['claims/timeline']);
    expect(hit('Calls Monday to Friday, around your working day. A 30-minute call. Week after week, we ship.')).toEqual([]);
  });
});
