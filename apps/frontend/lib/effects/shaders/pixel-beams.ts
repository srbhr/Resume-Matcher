import { GLSL_BAYER, GLSL_HEAD, GLSL_MIRROR } from './common';

/**
 * Pixel Beams, ported from the shaders.com composition: Dither (bayer8, pixelSize 7, threshold
 * 0.41) over Plasma (contrast 0.9, density 0.3, intensity 1.3, speed 1) bent by WaveDistortion
 * (square wave, angle 138, frequency 1.8, strength 1, mirror edges).
 *
 * Swiss palette: the dither's two colours are Canvas and Steel, and the dots sit at `u_level`
 * opacity, so the field stays a quiet grey texture behind content.
 */

/** Uniform name -> `--sw-*` token, read at runtime so the palette stays in globals.css. */
export const PIXEL_BEAMS_TOKENS = {
  u_canvas: '--sw-canvas',
  u_steel: '--sw-steel',
} as const;

export const PIXEL_BEAMS_FRAGMENT = `${GLSL_HEAD}${GLSL_BAYER}${GLSL_MIRROR}
uniform vec3 u_canvas;
uniform vec3 u_steel;

// Composition parameters.
const float PIXEL_SIZE = 7.0;
const float THRESHOLD = 0.41;
const float PLASMA_DENSITY = 0.3;
const float PLASMA_INTENSITY = 1.3;
const float PLASMA_CONTRAST = 0.9;
const float WAVE_ANGLE = 138.0;
const float WAVE_FREQUENCY = 1.8;
const float WAVE_STRENGTH = 1.0;

// Four-sine plasma, 0-1.
float plasma(vec2 p, float t) {
  float v = sin(p.x + t);
  v += sin((p.y + t) * 0.5);
  v += sin((p.x + p.y + t) * 0.5);
  vec2 c = p + vec2(sin(t * 0.33), cos(t * 0.5)) * 2.0;
  v += sin(sqrt(dot(c, c) + 1.0) + t);
  return v * 0.125 + 0.5;
}

void main() {
  float cell = PIXEL_SIZE * u_dpr;
  vec2 id = floor(gl_FragCoord.xy / cell);
  vec2 inCell = gl_FragCoord.xy / cell - id;
  // Everything is evaluated at the cell centre, so each dither pixel is one flat value. The
  // composition's y axis points down (its 138 degree wave runs down-left), so flip GL's.
  vec2 uv = (id + 0.5) * cell / u_resolution;
  uv.y = 1.0 - uv.y;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 scale = vec2(aspect, 1.0);
  float t = u_time * 0.4 + 11.0;

  // WaveDistortion: a square wave along the wave direction shifts the plasma either way.
  float a = radians(WAVE_ANGLE);
  vec2 dir = vec2(cos(a), sin(a));
  float phase = dot(uv * scale, dir) * WAVE_FREQUENCY * 2.0 * PI + t * 0.4;
  float square = sign(sin(phase));
  vec2 bent = mirror(uv + dir * square * WAVE_STRENGTH * 0.3 / scale);

  float v = plasma(bent * scale * PLASMA_DENSITY * 20.0, t);
  float lum = (v - 0.5) * (1.0 + PLASMA_CONTRAST) * PLASMA_INTENSITY + 0.08;

  // Dither: a cell is on where the luminance beats its Bayer threshold, shifted by THRESHOLD.
  float on = step(THRESHOLD + bayer8(id) - 0.5, lum);

  // Each on-cell is a square dot with a gap around it.
  float dotMask = step(0.18, min(min(inCell.x, inCell.y), min(1.0 - inCell.x, 1.0 - inCell.y)));
  vec3 color = mix(u_canvas, u_steel, on * dotMask * u_level);
  gl_FragColor = vec4(color, 1.0);
}
`;
