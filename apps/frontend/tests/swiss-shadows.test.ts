import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/(default)/css/globals.css'),
  'utf8'
);
const shadows = Object.fromEntries(
  [...css.matchAll(/--shadow-sw-([a-z]+):\s*([^;]+);/g)].map(([, name, value]) => [
    name,
    value.trim(),
  ])
);
// x y blur spread colour
const parse = (value: string) => {
  const [x, y, blur, spread, ...colour] = value.split(/\s+/);
  return { x, y, blur, spread, colour: colour.join(' ') };
};

describe('Swiss shadow tokens', () => {
  it('defines the solid roles and the nested role', () => {
    expect(Object.keys(shadows).sort()).toEqual(['card', 'default', 'lg', 'nested', 'sm', 'xl']);
  });

  it('never blurs or spreads a shadow', () => {
    for (const value of Object.values(shadows)) {
      const { blur, spread } = parse(value);
      expect(blur).toBe('0px');
      expect(spread).toBe('0px');
    }
  });

  it('keeps floating and pressable roles solid ink and the nested role translucent ink', () => {
    for (const name of ['sm', 'default', 'lg', 'xl', 'card']) {
      expect(parse(shadows[name]).colour).toBe('#000000');
    }
    expect(parse(shadows.nested)).toEqual({
      x: '4px',
      y: '4px',
      blur: '0px',
      spread: '0px',
      colour: 'rgb(0 0 0 / 0.15)',
    });
  });
});
