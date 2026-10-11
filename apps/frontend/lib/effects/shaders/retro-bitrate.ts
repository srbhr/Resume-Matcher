import { GLSL_BAYER, GLSL_HEAD, GLSL_MIRROR } from './common';

/**
 * Retro Bitrate, from the shaders.com composition: SimplexNoise (scale 4.3, speed 0.1) drives a
 * LinearGradient's angle from 0 to 360 degrees (mirror edges, start (0.67, 0.48), end
 * (0.89, 0.39)), Pixelate (scale 41), with a Dither (pixelSize 3) on top.
 *
 * Swiss palette, light: the field is Canvas. The gradient position picks each block's grey (Canvas,
 * Panel, Panel Hover, Panel Hover with a little Steel); a second noise field turns some blocks
 * faded Hyper Blue (Canvas mixed 15-30% toward Primary, computed here from the tokens). `u_level`
 * is the share of blue blocks: idle is mostly grey, active has more blue. The dither is a subtle
 * Steel or Primary dot overlay at low alpha, so contrast stays as low as Pixel Beams.
 */

/** Uniform name -> `--sw-*` token, read at runtime so the palette stays in globals.css. */
export const RETRO_BITRATE_TOKENS = {
  u_canvas: '--sw-canvas',
  u_panel: '--sw-panel',
  u_panel_hover: '--sw-panel-hover',
  u_steel: '--sw-steel',
  u_primary: '--sw-primary',
} as const;

export const RETRO_BITRATE_FRAGMENT = `${GLSL_HEAD}${GLSL_BAYER}${GLSL_MIRROR}
uniform vec3 u_canvas;
uniform vec3 u_panel;
uniform vec3 u_panel_hover;
uniform vec3 u_steel;
uniform vec3 u_primary;

// Composition parameters.
const float NOISE_SCALE = 4.3;
const float NOISE_SPEED = 0.1;
const vec2 GRADIENT_START = vec2(0.67, 0.48);
const vec2 GRADIENT_END = vec2(0.89, 0.39);
const float PIXELATE = 41.0;
const float DITHER_PIXEL = 3.0;

// Light palette: how much Steel the darkest grey takes, how far the faded blue is mixed from
// Canvas toward Primary, and how strong the dither dots are over a block.
const float STEEL_WEIGHT = 0.12;
const float BLUE_MIN = 0.15;
const float BLUE_MAX = 0.3;
const float DOT_ALPHA = 0.1;

// 3D simplex noise, -1 to 1. Ian McEwan, Ashima Arts (MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// A flat random 0-1 per block, for the mosaic.
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 scale = vec2(aspect, 1.0);

  // Pixelate: 41 CSS px blocks; the whole field is evaluated at the block centre.
  float block = PIXELATE * u_dpr;
  vec2 cell = floor(gl_FragCoord.xy / block);
  vec2 uv = (cell + 0.5) * block / u_resolution;
  uv.y = 1.0 - uv.y; // the composition's y axis points down
  vec2 p = uv * scale;

  // SimplexNoise: luminance 0-1, drifting in its third dimension. It sets the gradient angle.
  float n = snoise(vec3(p * NOISE_SCALE, u_time * NOISE_SPEED)) * 0.5 + 0.5;
  float angle = n * 2.0 * PI;

  // LinearGradient: position along the start-end axis, turned by the noise angle, mirrored.
  vec2 start = GRADIENT_START * scale;
  vec2 axis = GRADIENT_END * scale - start;
  float len = length(axis);
  vec2 dir = normalize(axis);
  dir = vec2(dir.x * cos(angle) - dir.y * sin(angle), dir.x * sin(angle) + dir.y * cos(angle));
  float t = mirror1(dot(p - start, dir) / len);

  // Greys: four steps (Canvas, Panel, Panel Hover, Panel Hover with a little Steel), jittered per
  // block so the edges between them are a mosaic rather than a smooth band. The darker steps are
  // rarer, so most of the field stays quiet.
  float c = clamp(t + (hash(cell) - 0.5) * 0.3, 0.0, 1.0);
  float tone = step(0.4, c) + step(0.7, c) + step(0.9, c);
  vec3 grey = u_canvas;
  if (tone == 1.0) grey = u_panel;
  else if (tone == 2.0) grey = u_panel_hover;
  else if (tone == 3.0) grey = mix(u_panel_hover, u_steel, STEEL_WEIGHT);
  float ink = tone / 3.0;

  // Faded blue: a second noise field picks the blocks; u_level widens the share (idle is mostly
  // grey, active has far more blue). The blue is Canvas mixed toward Primary, per block.
  float b = snoise(vec3(p * NOISE_SCALE * 0.8 + 17.0, u_time * NOISE_SPEED * 1.3)) * 0.5 + 0.5;
  b += (hash(cell + 7.3) - 0.5) * 0.16;
  float isBlue = step(0.74 - 0.22 * u_level, b);
  float k = mix(BLUE_MIN, BLUE_MAX, hash(cell + 3.1));
  vec3 color = mix(grey, mix(u_canvas, u_primary, k), isBlue);
  ink = mix(ink, 0.4 + 2.0 * k, isBlue);

  // Dither: a faint Steel or Primary dot overlay (bayer4, 3 CSS px), denser on the darker blocks
  // and absent on Canvas. Plain alpha over the block: screen would wash out on a light ground.
  vec2 dpx = floor(gl_FragCoord.xy / (DITHER_PIXEL * u_dpr));
  float dotOn = step(bayer4(dpx), ink * 0.6) * step(0.01, ink);
  color = mix(color, mix(u_steel, u_primary, isBlue), dotOn * DOT_ALPHA);

  gl_FragColor = vec4(color, 1.0);
}
`;
