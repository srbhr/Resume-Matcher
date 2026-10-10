import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAYER } from '@/lib/effects/beams';
import { GLSL_BAYER } from '@/lib/effects/shaders/common';
import { PIXEL_BEAMS_FRAGMENT, PIXEL_BEAMS_TOKENS } from '@/lib/effects/shaders/pixel-beams';
import { RETRO_BITRATE_FRAGMENT, RETRO_BITRATE_TOKENS } from '@/lib/effects/shaders/retro-bitrate';

const CSS = fs.readFileSync(path.resolve(__dirname, '../app/(default)/css/globals.css'), 'utf8');

const EFFECTS = [
  { name: 'Pixel Beams', fragment: PIXEL_BEAMS_FRAGMENT, tokens: PIXEL_BEAMS_TOKENS },
  { name: 'Retro Bitrate', fragment: RETRO_BITRATE_FRAGMENT, tokens: RETRO_BITRATE_TOKENS },
];

const declares = (source: string, type: string, name: string) =>
  new RegExp(`^\\s*uniform\\s+${type}\\s+${name}\\s*;`, 'm').test(source);

/** The GLSL `bayer2/4/8` recursion, ported line for line, to check the maths without a GPU. */
const fract = (x: number) => x - Math.floor(x);
const bayer2 = (x: number, y: number) => {
  const [fx, fy] = [Math.floor(x), Math.floor(y)];
  return fract(fx / 2 + fy * fy * 0.75);
};
const bayer4 = (x: number, y: number) => bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
const bayer8 = (x: number, y: number) => bayer4(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);

describe('Bayer threshold in GLSL', () => {
  it('is the same recursion this test ports (so the check below is of the shipped text)', () => {
    expect(GLSL_BAYER).toContain(
      'float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }'
    );
    expect(GLSL_BAYER).toContain(
      'float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }'
    );
    expect(GLSL_BAYER).toContain(
      'float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }'
    );
  });

  it('equals the 8x8 Bayer matrix entry / 64 for every cell', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(bayer8(x, y)).toBeCloseTo(BAYER[y * 8 + x] / 64, 10);
      }
    }
  });

  it('repeats every 8 cells', () => {
    expect(bayer8(11, 19)).toBe(bayer8(3, 3));
  });

  it('bayer4 is the 4x4 matrix: every level 0-15 once', () => {
    const levels = Array.from({ length: 16 }, (_, i) =>
      Math.round(bayer4(i % 4, Math.floor(i / 4)) * 16)
    );
    expect([...levels].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe.each(EFFECTS)('$name shader', ({ fragment, tokens }) => {
  it('declares the uniforms the runner sets', () => {
    expect(declares(fragment, 'float', 'u_time')).toBe(true);
    expect(declares(fragment, 'vec2', 'u_resolution')).toBe(true);
    expect(declares(fragment, 'float', 'u_dpr')).toBe(true);
    expect(declares(fragment, 'float', 'u_level')).toBe(true);
  });

  it('declares one vec3 per palette token the component reads', () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    for (const uniform of Object.keys(tokens)) {
      expect(declares(fragment, 'vec3', uniform), `${uniform} is declared as a vec3`).toBe(true);
    }
  });

  it('reads only --sw-* tokens that exist in globals.css', () => {
    for (const token of Object.values(tokens)) {
      expect(token).toMatch(/^--sw-[a-z-]+$/);
      expect(CSS, `${token} is defined`).toMatch(new RegExp(`${token}:\\s*#[0-9a-fA-F]{6}\\s*;`));
    }
  });

  it('hard-codes no colour: the palette arrives through uniforms', () => {
    expect(fragment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('is GLSL ES 1.0 with a high-precision default and a mediump fallback', () => {
    expect(fragment).not.toContain('#version');
    expect(fragment).toContain('#ifdef GL_FRAGMENT_PRECISION_HIGH');
    expect(fragment).toContain('precision mediump float;');
    expect(fragment).toMatch(/void main\(\)/);
    expect(fragment).toContain('gl_FragColor');
  });

  it('writes an opaque colour', () => {
    expect(fragment).toMatch(/gl_FragColor = vec4\([^;]*, 1\.0\);/);
  });
});

describe('Pixel Beams parameters (from the shaders.com composition)', () => {
  it.each([
    ['PIXEL_SIZE', '7.0'],
    ['THRESHOLD', '0.41'],
    ['PLASMA_DENSITY', '0.3'],
    ['PLASMA_INTENSITY', '1.3'],
    ['PLASMA_CONTRAST', '0.9'],
    ['WAVE_ANGLE', '138.0'],
    ['WAVE_FREQUENCY', '1.8'],
    ['WAVE_STRENGTH', '1.0'],
  ])('%s is %s', (name, value) => {
    expect(PIXEL_BEAMS_FRAGMENT).toContain(`const float ${name} = ${value};`);
  });

  it('dithers with the 8x8 matrix, over a mirrored square-wave bend', () => {
    expect(PIXEL_BEAMS_FRAGMENT).toContain('bayer8(id)');
    expect(PIXEL_BEAMS_FRAGMENT).toContain('sign(sin(phase))');
    expect(PIXEL_BEAMS_FRAGMENT).toContain('mirror(');
  });

  it('is Canvas and Steel', () => {
    expect(PIXEL_BEAMS_TOKENS).toEqual({ u_canvas: '--sw-canvas', u_steel: '--sw-steel' });
  });
});

describe('Retro Bitrate parameters (from the shaders.com composition)', () => {
  it.each([
    ['NOISE_SCALE', 'float', '4.3'],
    ['NOISE_SPEED', 'float', '0.1'],
    ['PIXELATE', 'float', '41.0'],
    ['DITHER_PIXEL', 'float', '3.0'],
    ['GRADIENT_START', 'vec2', 'vec2(0.67, 0.48)'],
    ['GRADIENT_END', 'vec2', 'vec2(0.89, 0.39)'],
    ['BLUE_MIN', 'float', '0.15'],
    ['BLUE_MAX', 'float', '0.3'],
  ])('%s is %s', (name, type, value) => {
    expect(RETRO_BITRATE_FRAGMENT).toContain(`const ${type} ${name} = ${value};`);
  });

  it('maps noise luminance to an angle over the full turn', () => {
    expect(RETRO_BITRATE_FRAGMENT).toContain('n * 2.0 * PI');
  });

  it('is light: Canvas, grey Panel steps and faded Hyper Blue, with a plain-alpha dither', () => {
    expect(RETRO_BITRATE_TOKENS).toEqual({
      u_canvas: '--sw-canvas',
      u_panel: '--sw-panel',
      u_panel_hover: '--sw-panel-hover',
      u_steel: '--sw-steel',
      u_primary: '--sw-primary',
    });
    // The faded blue is computed from the tokens, never hard-coded.
    expect(RETRO_BITRATE_FRAGMENT).toContain('mix(u_canvas, u_primary, k)');
    // Nothing is dark: no Ink uniform, no screen blend (it washes out on a light ground), and no
    // dome mask cutting a shape out of the field.
    expect(RETRO_BITRATE_FRAGMENT).not.toContain('u_ink');
    expect(RETRO_BITRATE_FRAGMENT).not.toContain('1.0 - (1.0 - a) * (1.0 - b)');
    expect(RETRO_BITRATE_FRAGMENT).not.toContain('CIRCLE');
  });

  it('uses u_level as the share of blue blocks, not as a dim toward black', () => {
    expect(RETRO_BITRATE_FRAGMENT).toMatch(/isBlue = step\([^;]*u_level[^;]*, b\);/);
  });
});
