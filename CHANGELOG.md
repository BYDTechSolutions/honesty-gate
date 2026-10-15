# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-16

### Added

- `honesty-gate` CLI: scans a directory of built HTML and exits 0 (clean), 1
  (error-level findings) or 2 (usage or config error, including no matching files).
- Rules with `text`, `attr`, `raw` and `all` scopes, `error`/`warn` levels, and
  per-rule `include`/`exclude` globs.
- Visible-text reader that removes comments and the content of `<script>`,
  `<style>`, `<template>` and `<noscript>`, decodes entities, and maps matches
  back to source lines.
- `placeholders` preset, on by default: unresolved brackets, lorem ipsum,
  TODO/TBD/FIXME, unrendered template syntax, `undefined`/`NaN`/`[object Object]`,
  and `href="#"`.
- Config files (`honesty-gate.config.{mjs,js,json}`), discovered in the current
  directory or passed with `--config`, validated on load.
- Output formats `text`, `json` and `github` (workflow annotations), with
  `--max-findings` and `--quiet`.
- API: `scan`, `scanReport`, `defineConfig`, `loadConfig`, `presets`,
  `formatResult` and the helpers they use.
- Examples: an opt-in marketing-claims config, a JSON config, and a sample site.

[Unreleased]: https://github.com/BYDTechSolutions/honesty-gate/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BYDTechSolutions/honesty-gate/releases/tag/v0.1.0
