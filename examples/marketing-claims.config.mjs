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

  // Hand-written text files are checked too: an llms.txt is the easiest place
  // for an old promise to survive after the pages dropped it. Name them; do
  // not include '**/*.txt', because a Next.js static export writes every
  // page's RSC payload as a .txt file beside it, and that is not copy. For a
  // Next.js server build, prerendered route handlers end in `.body`
  // ('llms.txt.body').
  include: ['**/*.html', 'llms.txt', 'llms-full.txt'],

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
      // Adjacent words only: "drafting a reply or updating a record, within
      // limits" is not a promise, and neither is "the store reviews most
      // submissions within a day or two".
      pattern:
        /\b(?:repl(?:y|ies)|respon(?:d|ds|se)|get back to you) within\b|\bwithin (?:one|two|three|\d+) (?:business|working) days?\b|\bwithin (?:an?|one|two|\d+|twenty-four) hours?\b/gi,
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
      // "4-6 weeks", "3 to 5 months", "Week 1", "in 6 weeks". Case-sensitive
      // "Week" so prose like "week after week" passes; spelled-out numbers
      // ("ships in six weeks") are left alone because they turn up in quotes
      // and stories more often than in promises.
      pattern: /\b\d+\s?(?:–|-|to)\s?\d+\s?(?:[Ww]eeks?|[Mm]onths?)\b|\bWeeks? \d|\b(?:in|within) \d+ (?:weeks?|months?)\b/g,
      message: 'A timeline',
    },
  ],
});
