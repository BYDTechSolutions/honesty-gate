// Opt-in rules for a services business that has decided its site promises
// nothing it cannot guarantee: no prices, no timelines, no fixed price, no
// reply-time promise, no demo or update cadence. Each rule reads what a
// visitor sees (text and attributes), so a script that happens to contain
// "$5" or "every Friday" does not fail the build.
//
// Copy this file to your project as honesty-gate.config.mjs and adjust.
// Try it here:  npx honesty-gate examples/sample-site --config examples/marketing-claims.config.mjs
import { defineConfig } from '@bydtech/honesty-gate';

export default defineConfig({
  // Your build output: `out` (Next.js static export), `dist` (Astro, Vite),
  // `public` (Hugo), `_site` (Eleventy, Jekyll), `.next/server/app` (Next.js).
  dir: 'out',

  // Plain-text files are checked too: a hand-written llms.txt is the easiest
  // place for an old promise to survive after the pages dropped it. For a
  // Next.js server build, prerendered route handlers end in `.body`
  // (`llms.txt.body`), so add '**/*.txt.body'.
  include: ['**/*.html', '**/*.txt'],

  // The placeholders preset stays on.
  extends: ['placeholders'],

  rules: [
    {
      id: 'claims/demo-cadence',
      pattern:
        /\bevery (?:Monday|Tuesday|Wednesday|Thursday|Friday)\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday) demos?\b|\bweekly (?:demos?|updates?|check-?ins?)\b|\bdaily (?:updates?|demos?|stand-?ups?|check-?ins?|reports?)\b|\b(?:updates?|demos?) (?:every|each) (?:day|week)\b/gi,
      message: 'A demo or update cadence the team may not keep',
    },
    {
      id: 'claims/fixed-price',
      pattern: /\bfixed[- ](?:price|fee|quote)s?\b|\bflat[- ]fee\b|\bfixed per (?:phase|project|milestone)\b/gi,
      message: 'A fixed-price claim',
    },
    {
      id: 'claims/reply-time',
      pattern:
        /\b(?:repl(?:y|ies)|respon(?:d|ds|se)|get back to you|hear back)\b[^.!?]{0,30}?\bwithin\b|\bwithin (?:an?|one|two|three|\d+) (?:business |working )?(?:hours?|days?)\b/gi,
      message: 'A reply-time promise',
    },
    {
      id: 'claims/price',
      // A currency sign or code next to a number, or a price placeholder ($[X]).
      pattern: /[$€£¥₹]\s?\d|[$€£]\[|\b(?:USD|EUR|GBP)\s?\d|\d\s?(?:USD|EUR|GBP)\b/g,
      message: 'A price',
    },
    {
      id: 'claims/timeline',
      // "4-6 weeks", "3 to 5 months", "Week 1", "in six weeks". Case-sensitive
      // "Week" so prose like "week after week" passes.
      pattern:
        /\b\d+\s?(?:–|-|to)\s?\d+\s?(?:[Ww]eeks?|[Mm]onths?)\b|\bWeeks? \d|\b(?:in|within) (?:\d+|two|three|four|five|six|eight|ten|twelve) (?:weeks?|months?)\b/g,
      message: 'A timeline',
    },
  ],
});
