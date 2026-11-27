import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** ui-sdk sits behind the Swiss wrappers in components/ui; nothing else imports it. */
describe('ui-sdk stays behind components/ui', () => {
  const root = path.join(__dirname, '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(tsx?|css)$/.test(name) ? [full] : [];
    });

  it('only components/ui wrappers import @ui-sdk', () => {
    const outside = ['app', 'components', 'hooks', 'lib']
      .flatMap((dir) => sources(path.join(root, dir)))
      .filter((file) => !file.startsWith(path.join(root, 'components', 'ui') + path.sep))
      .filter((file) => /from '@ui-sdk\/|@import '@ui-sdk\//.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file));

    expect(outside).toEqual([]);
  });
});
