import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Build once so test/bin.test.ts can run the real `dist/cli.js`. */
export default function setup(): void {
  const root = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/tsup/dist/cli-default.js', import.meta.url)), '--silent'], {
    cwd: root,
    stdio: 'inherit',
  });
}
