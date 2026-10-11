/** GLSL ES 1.0 pieces shared by the effect shaders. */

/**
 * Precision and the uniforms `gl-runner` sets itself. `u_level` is the effect's brightness, 0-1:
 * the component eases it between its `idle` and `active` values.
 */
export const GLSL_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_level;
const float PI = 3.14159265359;
`;

/**
 * Ordered-dither thresholds without array lookups (WebGL 1 cannot index arrays dynamically).
 * `bayerN(cell)` is in [0, 1) and equals the matrix entry / N*N, for the cell's integer
 * coordinates; `tests/effect-shaders.test.ts` checks `bayer8` against `lib/effects/beams` BAYER.
 */
export const GLSL_BAYER = `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

/** Triangle-wave fold of 0-1 coordinates: the shaders.com "mirror" edge mode. */
export const GLSL_MIRROR = `
vec2 mirror(vec2 x) { return 1.0 - abs(mod(x, 2.0) - 1.0); }
float mirror1(float x) { return 1.0 - abs(mod(x, 2.0) - 1.0); }
`;
