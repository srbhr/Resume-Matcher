import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * In the app's build, `<section {...attrs} key={id}>` (the key after a spread) left
 * the Deedy template's sections without keys: React warned "Each child in a list
 * should have a unique key" on every render, though Vitest's compiler hid it. A
 * key goes before any spread, as every template now writes it.
 */
describe('resume templates', () => {
  it('never write a key after a props spread', () => {
    const dir = path.join(__dirname, '..', 'components', 'resume');
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.tsx'))
      .flatMap((name) =>
        readFileSync(path.join(dir, name), 'utf8')
          .split('\n')
          .map((line, index) => ({ name, line, index }))
          .filter(({ line }) => /\{\.\.\.[\w.]+\}[^>]*\skey=/.test(line))
          .map(({ name, index }) => `${name}:${index + 1}`)
      );
    expect(offenders).toEqual([]);
  });
});
