import { GLSL_BAYER, GLSL_HEAD, GLSL_MIRROR } from './common';

/**
 * Retro Bitrate, ported from the shaders.com composition: SimplexNoise (scale 4.3, speed 0.1)
 * drives a LinearGradient's angle from 0 to 360 degrees (HSL interpolation, mirror edges, start
 * (0.67, 0.48), end (0.89, 0.39)), masked by a Circle (centre (0.5, 0), radius 1.55), Pixelate
 * (scale 41), with a Dither (pixelSize 3) screen-blended on top.
 *
 * Swiss palette: the gradient runs Hyper Blue to Ink, the dither's two colours are Hyper Blue and
 * Signal Green, and `u_level` dims the whole field toward Ink for the idle state.
 */

/** Uniform name -> `--sw-*` token, read at runtime so the palette stays in globals.css. */
export const RETRO_BITRATE_TOKENS = {
  u_primary: '--sw-primary',
  u_ink: '--sw-ink',
  u_success: '--sw-success',
} as const;

export const RETRO_BITRATE_FRAGMENT = `${GLSL_HEAD}${GLSL_BAYER}${GLSL_MIRROR}
uniform vec3 u_primary;
uniform vec3 u_ink;
uniform vec3 u_success;

// Composition parameters.
const float NOISE_SCALE = 4.3;
const float NOISE_SPEED = 0.1;
const vec2 GRADIENT_START = vec2(0.67, 0.48);
const vec2 GRADIENT_END = vec2(0.89, 0.39);
const vec2 CIRCLE_CENTER = vec2(0.5, 0.0);
const float CIRCLE_RADIUS = 1.55;
const float PIXELATE = 41.0;
const float DITHER_PIXEL = 3.0;

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

// HSL, for the gradient's colour space.
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 0.0001) {
    s = d / (1.0 - abs(2.0 * l - 1.0));
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}
// Mix in HSL by the shortest hue path. An achromatic end (black) has no hue, so it takes the other's.
vec3 mixHsl(vec3 a, vec3 b, float t) {
  vec3 ha = rgb2hsl(a);
  vec3 hb = rgb2hsl(b);
  if (ha.y < 0.001) ha.x = hb.x;
  if (hb.y < 0.001) hb.x = ha.x;
  float dh = hb.x - ha.x;
  dh -= floor(dh + 0.5);
  return hsl2rgb(vec3(fract(ha.x + dh * t), mix(ha.y, hb.y, t), mix(ha.z, hb.z, t)));
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 scale = vec2(aspect, 1.0);

  // Pixelate: 41 CSS px blocks; the whole gradient is evaluated at the block centre.
  float block = PIXELATE * u_dpr;
  vec2 uv = (floor(gl_FragCoord.xy / block) + 0.5) * block / u_resolution;
  uv.y = 1.0 - uv.y; // the composition's y axis points down, so the circle is at the top
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
  vec3 color = mixHsl(u_primary, u_ink, t);

  // Circle mask: the gradient inside, Ink outside. The radius is in half heights: that is where the
  // shaders.com presets' arc bottoms out (about 0.78 of the height at radius 1.55).
  float inside = step(length(p - CIRCLE_CENTER * scale), CIRCLE_RADIUS * 0.5);
  color = mix(u_ink, color, inside);

  // Dither on top (bayer4, 3 CSS px): each pixel is Hyper Blue or Signal Green by luminance,
  // screen-blended over the gradient.
  vec2 dpx = floor(gl_FragCoord.xy / (DITHER_PIXEL * u_dpr));
  float rel = clamp(luma(color) / max(luma(u_primary), 0.001), 0.0, 1.0);
  vec3 dithered = rel > bayer4(dpx) ? u_success : u_primary;
  color = screen(color, dithered * (0.1 + 0.4 * rel));

  gl_FragColor = vec4(mix(u_ink, color, u_level), 1.0);
}
`;
