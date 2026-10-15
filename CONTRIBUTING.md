# Contributing

Thanks for helping. Issues and pull requests are welcome at
[github.com/BYDTechSolutions/honesty-gate](https://github.com/BYDTechSolutions/honesty-gate).

## Setup

```sh
git clone https://github.com/BYDTechSolutions/honesty-gate.git
cd honesty-gate
npm ci
```

Node 20 or later.

## Checks

Run all four before opening a pull request; CI runs the same on Node 20, 22 and 24.

```sh
npm run typecheck
npm test          # builds dist/ first, so the bin tests run the real CLI
npm run build
npm pack --dry-run
```

## Guidelines

- **False positives are bugs.** A gate that fails good builds gets switched
  off. A change to a preset rule needs fixtures for what it should catch and
  for what it must let through.
- Add a fixture under `test/fixtures/` when a real build output misled the
  reader, and keep it small.
- No runtime dependencies without a strong reason, stated in the README.
- Keep the README's option tables in step with the code.
- Add a line to `CHANGELOG.md` under `Unreleased`.
- American English in code, docs and messages.
