/**
 * A small glob matcher, so the package needs no dependency for it.
 * (`path.matchesGlob` exists from Node 20.17 / 22.5 but was experimental
 * there, and `engines` starts at 20.0.)
 *
 * Supported: `**` (any number of path segments, including none), `*` (any run
 * of characters except `/`), `?` (one character except `/`), `{a,b}`
 * alternation (nestable), and `[abc]` / `[!abc]` classes. Paths and patterns
 * use `/`. A pattern with no `/` matches the file name at any depth, so
 * `*.html` matches both `index.html` and `blog/post/index.html`.
 */

const cache = new Map<string, RegExp>();

/** Compile a glob to an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;
  let pattern = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!pattern.includes('/')) pattern = `**/${pattern}`;
  const re = new RegExp(`^${translate(pattern)}$`);
  cache.set(glob, re);
  return re;
}

function translate(p: string): string {
  let out = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i]!;
    if (c === '*') {
      if (p[i + 1] === '*') {
        const atStart = i === 0 || p[i - 1] === '/';
        const atEnd = i + 2 === p.length || p[i + 2] === '/';
        if (atStart && atEnd) {
          if (p[i + 2] === '/') {
            out += '(?:[^/]*/)*';
            i += 3;
          } else {
            out += '.*';
            i += 2;
          }
          continue;
        }
        out += '[^/]*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i++;
    } else if (c === '?') {
      out += '[^/]';
      i++;
    } else if (c === '{') {
      const end = matchingBrace(p, i);
      if (end === -1) {
        out += '\\{';
        i++;
        continue;
      }
      const options = splitTopLevel(p.slice(i + 1, end));
      out += `(?:${options.map(translate).join('|')})`;
      i = end + 1;
    } else if (c === '[') {
      const end = p.indexOf(']', i + 2);
      if (end === -1) {
        out += '\\[';
        i++;
        continue;
      }
      let body = p.slice(i + 1, end);
      const negate = body.startsWith('!') || body.startsWith('^');
      if (negate) body = body.slice(1);
      body = body.replace(/[\\\]^]/g, '\\$&');
      out += negate ? `[^/${body}]` : `[${body}]`;
      i = end + 1;
    } else {
      out += c.replace(/[.+^$()|\\]/g, '\\$&');
      i++;
    }
  }
  return out;
}

function matchingBrace(p: string, open: number): number {
  let depth = 0;
  for (let i = open; i < p.length; i++) {
    if (p[i] === '{') depth++;
    else if (p[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/** True when `path` (relative, `/`-separated) matches any of `globs`. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}
