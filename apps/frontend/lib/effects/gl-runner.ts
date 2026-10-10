/**
 * A tiny raw-WebGL runner for the full-screen effects (Pixel Beams, Retro Bitrate): one triangle
 * that covers the screen, one fragment shader, no library. It sets `u_time` (seconds), `u_resolution`
 * (device pixels) and `u_dpr` itself; the effect passes everything else through `uniforms()`.
 *
 * It draws at a capped frame rate, only while on screen and while the tab is visible, at most 2x
 * device pixels. `still` draws one frame and never loops (reduced motion). `createGlRunner`
 * returns `null` when WebGL is unavailable or the shader does not compile, so the caller can fall
 * back; `onLost` reports a context the browser takes away later.
 */

const MAX_DPR = 2;
/** Longest animation step in seconds, so a throttled or resumed tab never jumps. */
const MAX_STEP = 0.2;

const VERTEX = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';
// One triangle that overshoots the clip square, so there is no diagonal seam to shade twice.
const TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

type UniformValue = number | readonly number[];

export interface GlRunnerOptions {
  /** GLSL ES 1.0 fragment shader. */
  source: string;
  /** Frame-rate cap while looping. */
  fps: number;
  /** Draw one frame and never loop. */
  still?: boolean;
  /** Effect uniforms, read on every draw: a number is a float, an array a vec2, vec3 or vec4. */
  uniforms: () => Record<string, UniformValue>;
  /** Time scale, read on every frame. `u_time` accumulates `dt * speed`, so changing it never jumps. */
  speed?: () => number;
  /** The browser took the context away after start-up. */
  onLost?: () => void;
}

export interface GlRunner {
  /** Repaint now with the current uniforms (a still frame whose inputs changed). */
  redraw: () => void;
  dispose: () => void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error('Effect shader failed to compile:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGLRenderingContext, fragment: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = vs && fs ? gl.createProgram() : null;
  if (program && vs && fs) {
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Effect shader failed to link:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
  }
  // The linked program keeps what it needs.
  if (vs) gl.deleteShader(vs);
  if (fs) gl.deleteShader(fs);
  return program;
}

function setUniform(gl: WebGLRenderingContext, loc: WebGLUniformLocation | null, v: UniformValue) {
  if (typeof v === 'number') gl.uniform1f(loc, v);
  else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
  else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
  else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
}

export function createGlRunner(canvas: HTMLCanvasElement, opts: GlRunnerOptions): GlRunner | null {
  const attributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power' as const,
  };
  const gl = (canvas.getContext('webgl', attributes) ??
    canvas.getContext('experimental-webgl', attributes)) as WebGLRenderingContext | null;
  if (!gl) return null;

  const loseContext = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
  const program = link(gl, opts.source);
  if (!program) {
    loseContext();
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, TRIANGLE, gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const set = (name: string, value: UniformValue) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    setUniform(gl, locations.get(name) ?? null, value);
  };

  let dpr = 1;
  let t = 0;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  };

  const draw = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    set('u_time', t);
    set('u_resolution', [canvas.width, canvas.height]);
    set('u_dpr', dpr);
    for (const [name, value] of Object.entries(opts.uniforms())) set(name, value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  resize();
  // Resizing clears the drawing buffer, so repaint in the same task or the canvas flashes empty.
  const resizeObserver = new ResizeObserver(() => {
    resize();
    draw();
  });
  resizeObserver.observe(canvas);
  draw();

  let visible = false;
  let last = 0;
  let frame = 0;
  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden) return;
    if (now - last >= 1000 / opts.fps) {
      t += last ? Math.min((now - last) / 1000, MAX_STEP) * (opts.speed?.() ?? 1) : 0;
      draw();
      last = now;
    }
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    if (frame) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  let intersection: IntersectionObserver | undefined;
  const onVisibility = () => {
    if (document.hidden) stop();
    else if (visible) start();
  };
  if (!opts.still) {
    intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
  }

  const onLost = (event: Event) => {
    event.preventDefault();
    stop();
    opts.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  return {
    redraw: draw,
    dispose() {
      stop();
      resizeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      loseContext();
    },
  };
}

/**
 * A `--sw-*` colour token as 0-1 channels, read at runtime so the palette stays in globals.css.
 * The tokens are 6-digit hex (`swiss-contrast.test.ts` enforces it); anything else, including the
 * empty string jsdom returns, reads as black.
 */
export function readSwissColor(el: Element, token: string): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue(token).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1];
  if (!hex) return [0, 0, 0];
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channel = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
  return [channel(0), channel(1), channel(2)];
}
