# Security policy

## Supported versions

The latest published version receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Email **sales.bydtech@gmail.com** with
"honesty-gate security" in the subject, a description, and steps to
reproduce. You will get a reply once the report has been reviewed, and
credit in the release notes if you want it.

## Scope

honesty-gate reads files in the directory you point it at and loads the
config file you give it. A `.mjs` or `.js` config is JavaScript and runs with
your permissions, like any build script: only use config files you trust.
Rule patterns are regular expressions run on every page, so a pattern from an
untrusted source can be slow.
