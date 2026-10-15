# @bydtech/honesty-gate

Fail the build when placeholder or forbidden copy reaches a rendered page. It reads what a visitor sees, not the raw markup.

[![npm](https://img.shields.io/npm/v/@bydtech/honesty-gate.svg)](https://www.npmjs.com/package/@bydtech/honesty-gate)
[![CI](https://github.com/BYDTechSolutions/honesty-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/BYDTechSolutions/honesty-gate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why it exists

A `[Client name]`, a `TODO`, an `undefined` where a price should be, or a claim the business has decided not to make reaches production because nothing checks the built pages. Grepping the build output does not work either: framework payloads (Next.js RSC, hydration JSON, JSON-LD, inline scripts) are full of brackets and the words a grep looks for, so the grep fails every build and gets switched off.

honesty-gate reads each built page the way a reader meets it (visible text, plus the attribute values a person reads or hears) and fails only on what actually shows. A few rules read the raw markup on purpose, for problems that live there.

It works on any directory of built HTML: a Next.js export (`out/`) or server build (`.next/server/app`), Astro or Vite (`dist/`), Hugo (`public/`), Eleventy or Jekyll (`_site/`), or hand-written static files.

## Install

```sh
npm install --save-dev @bydtech/honesty-gate
```

Node 20 or later. No runtime dependencies.

## Quick start

Build your site, then point the gate at the output directory:

```sh
npx honesty-gate out
```

On the sample site in this repository (`npx honesty-gate examples/sample-site` from a clone), it prints:

```text
examples/sample-site/index.html
     16  error  Unresolved [placeholder] in the copy  placeholders/bracket (text)
         …nd we send daily updates. Contact us at [email address]. Services

examples/sample-site/services/index.html
      7  error  TODO, TBD or FIXME left in the copy  placeholders/todo (attr:alt)
         alt="TODO: describe the photo"
      8  error  Link with href="#" goes nowhere  placeholders/empty-href (raw)
         ….jpg" alt="TODO: describe the photo"> <a href="#">Book a call</a> </body> </html>

honesty-gate: 3 errors, 0 warnings in 2 of 2 files. FAIL
```

The page's inline script is full of brackets, `undefined` and a `$5`; none of it is reported, because none of it is copy.

Run it after the build so a bad page never ships:

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "honesty-gate out"
  }
}
```

In GitHub Actions, `--format github` turns findings into annotations on the pull request:

```yaml
- run: npm run build
- run: npx honesty-gate out --format github
```

## CLI

```text
honesty-gate [dir] [options]
```

| Option | Description |
|---|---|
| `dir` | Directory of built HTML. Overrides `dir` in the config. |
| `-c, --config <path>` | Config file. Default: `honesty-gate.config.mjs`, `.js` or `.json` in the current directory, first found. |
| `--no-config` | Ignore any config file. |
| `-f, --format <name>` | `text` (default), `json`, or `github` (workflow annotations). |
| `--include <glob>` | Files to scan, relative to `dir`. Repeatable. Replaces the config's `include`. |
| `--exclude <glob>` | Files to skip. Repeatable. Replaces the config's `exclude`. |
| `--max-findings <n>` | Show at most `n` findings, errors first. The exit code still counts every finding. |
| `-q, --quiet` | Report errors only, and print nothing when the build is clean. |
| `--allow-empty` | Pass when no file matches, instead of exiting 2. |
| `--list-rules` | Print the rules that would run (after presets, custom rules and levels), then exit. |
| `-h, --help` / `-v, --version` | Help, version. |

Exit codes:

| Code | Meaning |
|---|---|
| `0` | No error-level findings. Warnings are allowed. |
| `1` | At least one error-level finding. |
| `2` | Usage or config error: an unknown flag, a bad config, a missing directory, or a directory with no matching files (a gate that checked nothing should not pass silently; use `--allow-empty` if that is intended). |

## API

```ts
import { scan, scanReport, loadConfig, formatResult } from '@bydtech/honesty-gate';

const findings = await scan({ dir: 'out' });
if (findings.some((f) => f.level === 'error')) process.exit(1);

// The same, with your config file and counts:
const { config } = await loadConfig();
const report = await scanReport({ ...config, dir: 'out' });
console.log(formatResult(report, 'text'));
```

| Export | Description |
|---|---|
| `scan(options): Promise<Finding[]>` | Scan a directory. `options` is a [config](#configuration) plus `cwd` (default `process.cwd()`). Does not read a config file. Throws `ConfigError` for bad options, a missing directory, or no matching files. |
| `scanReport(options): Promise<ScanResult>` | Same, returning `{ findings, files, errorCount, warningCount }`. |
| `defineConfig(config)` | Returns its argument; gives a config file types. |
| `loadConfig({ cwd?, path? })` | Load and validate a config file. Resolves to `{ config, path }`, or `{ config: {} }` when none is found. |
| `presets` | Built-in rule sets by name: `{ placeholders }`. |
| `formatResult(result, format?, { maxFindings?, quiet? })` | Render a `ScanResult` as `text`, `json` or `github`. |
| `checkSource(html, file, rules, isHtml?, attributes?)` | Run resolved rules over one document string. |
| `resolveRules(config)` | Presets plus custom rules plus `levels`, compiled. |
| `readHtml(html, attributes?)` | The visible text (with a map back to source offsets) and the human-facing attribute values of a document. |
| `decodeEntities(s)`, `globToRegExp(glob)`, `matchesAny(path, globs)` | The helpers the scanner uses. |
| `ConfigError` | Thrown for bad configuration. |

A `Finding` is:

```ts
interface Finding {
  file: string;        // relative to cwd, with / separators
  line: number;        // 1-based line in the source file
  ruleId: string;
  message: string;
  level: 'error' | 'warn';
  scope: 'text' | 'attr' | 'raw';
  attribute?: string;  // for attr: which attribute, e.g. "alt"
  match: string;
  context: string;     // the match with up to 40 characters either side
}
```

## Configuration

Put a config in `honesty-gate.config.mjs` (or `.js`, or `.json`) next to your `package.json`:

```js
// honesty-gate.config.mjs
import { defineConfig } from '@bydtech/honesty-gate';

export default defineConfig({
  dir: 'out',
  include: ['**/*.html', '**/*.txt'],
  levels: { 'placeholders/empty-href': 'warn' },
  rules: [
    {
      id: 'copy/staging-domain',
      pattern: /staging\.example\.com/,
      message: 'A link to the staging site',
    },
  ],
});
```

| Option | Default | Description |
|---|---|---|
| `dir` | none | Directory to scan, relative to the current directory. Required here or on the command line. |
| `include` | `["**/*.html", "**/*.htm"]` | Files to scan, as globs relative to `dir`. |
| `exclude` | `["**/node_modules/**"]` | Files to skip. |
| `extends` | `["placeholders"]` | Built-in presets to start from. `[]` turns them off. |
| `rules` | `[]` | Your rules (below). A rule with the same `id` as a preset rule replaces it. |
| `levels` | `{}` | Change a rule's level by id: `"error"`, `"warn"`, or `"off"`. Naming a rule that does not exist is an error. |
| `attributes` | `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-roledescription`, `aria-placeholder`, `aria-valuetext` | Generic attributes the `attr` scope reads. `href` on `<a>`/`<area>`, `value` on submit/button/reset inputs, and `content` on description, keywords, Open Graph and Twitter `<meta>` tags are always read. |
| `allowEmpty` | `false` | Pass when no file matches. |

Unknown options are an error, so a typo does not silently disable a check.

### Rules

| Field | Default | Description |
|---|---|---|
| `id` | required | Unique id, shown in output. |
| `pattern` | required | A `RegExp`, or a string that is a regular expression source (in JSON configs). The `g` flag is always added. |
| `flags` | `""` | Flags for a string `pattern`, such as `"i"`. |
| `message` | required | What a finding means. |
| `scope` | `"all"` | `"text"`, `"attr"`, `"raw"`, `"all"`, or an array of them. |
| `level` | `"error"` | `"error"` fails the gate; `"warn"` is reported and passes. |
| `include` / `exclude` | all scanned files | Globs that limit the rule to some files. |

Scopes:

- **`text`**: the page's visible text. Comments and the full content of `<script>`, `<style>`, `<template>` and `<noscript>` are removed, entities are decoded, whitespace is collapsed. A tag between two inline elements does not split a word (`<b>Lo</b>rem` reads as "Lorem"); any other tag reads as a space.
- **`attr`**: each human-facing attribute value, matched on its own (see `attributes` above).
- **`raw`**: the file exactly as written, scripts included. Use it for problems that live in markup (`href="#"`) or for content that reaches the browser without being painted, such as a record serialized into a hydration payload.
- **`all`**: `text` and `attr`. It does not include `raw`, which contains the text again and would report every hit twice.

Files that are not `.html`, `.htm` or `.xhtml` (an `llms.txt` you added to `include`, say) are read as plain text: the whole file is both `text` and `raw`, and there are no attributes.

### The `placeholders` preset

On by default. Every rule is an error and reads `all` unless noted.

| Rule | Catches | Lets through |
|---|---|---|
| `placeholders/bracket` | `[Client name]`, `[TBD]`, `hello@[domain]`, `$[X]`: a bracket that starts with a letter, or holds one capital letter | Footnotes and citations (`[1]`, `[2, 3]`), `[…]`, a single lowercase letter (`[a]`), code-style indexing (`items[index]`, `m[i][j]`: a bracket right after a letter, digit or `]`), Markdown links (`[docs](/docs)`, `[docs][1]`), `[sic]`, brackets over 60 characters |
| `placeholders/lorem-ipsum` | `lorem ipsum`, any case | |
| `placeholders/todo` | `TODO`, `TBD`, `FIXME` as whole words, uppercase only | "a todo app" |
| `placeholders/template-syntax` | `{{ name }}`, `{% if %}`, `${name}` left unrendered | Single braces such as `{5}` |
| `placeholders/js-value` | `undefined`, `NaN`, `[object Object]`, case-sensitive and whole-word | "Undefined" in a heading, "banana" |
| `placeholders/empty-href` (`raw`) | `<a href="#">` in any quoting | `href="#main"`, `<link href="#">` |

If a rule does not fit your site (a docs site that teaches Handlebars will show `{{ }}` on purpose, an events site may say "Venue: TBD"), lower it or turn it off with `levels`, or limit it with a replacement rule that has `exclude`.

### Example: marketing claims

[`examples/marketing-claims.config.mjs`](examples/marketing-claims.config.mjs) is an opt-in rule set for a services business that has decided its site promises nothing it cannot guarantee: no prices, no timelines, no fixed price, no reply-time promise, no demo or update cadence. Copy it, adjust it, and try it on the sample site:

```sh
npx honesty-gate examples/sample-site --config examples/marketing-claims.config.mjs
```

[`examples/basic.config.json`](examples/basic.config.json) shows the JSON form.

## How it works, and its limits

1. Walk `dir` (symlinks are not followed), keep files that match `include` and not `exclude`.
2. For each HTML file, tokenize it once with regular expressions into visible text, with a map from text offsets back to source lines, and a list of human-facing attribute values with their offsets.
3. Run each rule over the views its scope names, and report each match with its line and some context.

Said plainly:

- **It is not a full HTML parser.** It reads machine-written build output well. It does not implement the HTML5 error-recovery rules, so badly broken hand-written markup can be misread.
- **It does not run CSS or JavaScript.** Text hidden with `display: none` or the `hidden` attribute still counts as text. Text that only a client-side script inserts is not seen; content a framework serializes for hydration is visible only to `raw` rules.
- **`<noscript>` content is skipped**, because frameworks put tracking pixels and fallbacks there. Use a `raw` rule if it matters to you.
- **Entities**: numeric references and a common set of named ones (including encoded punctuation such as `&lbrack;`) are decoded. Rare named references stay as written.
- **Line numbers** are exact for the start of the matched text node or attribute. There are no column numbers.
- **Patterns are yours.** A string pattern is a regular expression; a slow pattern is slow on every page.
- No runtime dependencies: the glob matcher is built in (supports `**`, `*`, `?`, `{a,b}` and `[abc]`; a pattern without `/` matches the file name at any depth), because `path.matchesGlob` does not exist before Node 20.17 and prints an experimental warning where it does.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Maintained by [BYD Tech](https://bydtech.in), a software studio that builds MVPs, AI agents, and web & mobile apps.
