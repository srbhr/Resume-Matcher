import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlRunner, readSwissColor } from '@/lib/effects/gl-runner';
import { installFakeWebGl } from './fake-webgl';

const SOURCE =
  'precision mediump float; uniform float u_time; void main() { gl_FragColor = vec4(1.0); }';

let fake: ReturnType<typeof installFakeWebGl>;
let canvas: HTMLCanvasElement;

// Runners hold document listeners; dispose every one so tests cannot hear each other.
const started: NonNullable<ReturnType<typeof createGlRunner>>[] = [];
const start = (over: Partial<Parameters<typeof createGlRunner>[1]> = {}) => {
  const runner = createGlRunner(canvas, { source: SOURCE, fps: 24, uniforms: () => ({}), ...over });
  if (runner) started.push(runner);
  return runner;
};

beforeEach(() => {
  fake = installFakeWebGl();
  canvas = document.createElement('canvas');
  vi.stubGlobal('devicePixelRatio', 1);
});

afterEach(() => {
  started.splice(0).forEach((runner) => runner.dispose());
  fake.setHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createGlRunner: set-up', () => {
  it('compiles and links the given fragment source behind a full-screen triangle', () => {
    expect(start()).not.toBeNull();
    const { gl } = fake;
    expect(gl.shaderSource.mock.calls.map(([, src]) => src)).toContain(SOURCE);
    expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
    expect(gl.createShader).toHaveBeenCalledWith(gl.FRAGMENT_SHADER);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);
    expect(gl.useProgram).toHaveBeenCalledTimes(1);
    // One triangle that covers the clip square: three vertices, not two triangles.
    const [, data] = gl.bufferData.mock.calls[0];
    expect(Array.from(data as Float32Array)).toEqual([-1, -1, 3, -1, -1, 3]);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it('asks for an opaque, low-power context without antialiasing', () => {
    start();
    expect(fake.getContext).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({ alpha: false, antialias: false, powerPreference: 'low-power' })
    );
  });

  it('sets u_time, u_resolution, u_dpr and the effect uniforms on the first frame', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    start({ uniforms: () => ({ u_level: 0.5, u_tint: [0.1, 0.2, 0.3], u_pair: [1, 2] }) });
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(120);
    expect(fake.lastUniform('u_time')).toEqual([0]);
    expect(fake.lastUniform('u_resolution')).toEqual([240, 120]);
    expect(fake.lastUniform('u_dpr')).toEqual([2]);
    expect(fake.lastUniform('u_level')).toEqual([0.5]);
    expect(fake.lastUniform('u_tint')).toEqual([0.1, 0.2, 0.3]);
    expect(fake.lastUniform('u_pair')).toEqual([1, 2]);
    expect(fake.gl.viewport).toHaveBeenCalledWith(0, 0, 240, 120);
  });

  it('caps the device pixel ratio at 2', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    start();
    expect(canvas.width).toBe(240);
    expect(fake.lastUniform('u_dpr')).toEqual([2]);
  });

  it('reports failure with null when WebGL is unavailable', () => {
    fake.getContext.mockReturnValue(null);
    expect(start()).toBeNull();
    expect(fake.requestFrame).not.toHaveBeenCalled();
  });

  it('reports failure, and frees the context, when the shader does not compile', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.gl.getShaderParameter.mockReturnValue(false);
    expect(start()).toBeNull();
    expect(fake.loseContext).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
  });

  it('redraws when the box resizes', () => {
    start();
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(1);
    fake.resize();
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(2);
  });
});

describe('createGlRunner: the loop', () => {
  it('does not loop until it is on screen, then draws at the capped rate', () => {
    start({ fps: 24 });
    expect(fake.requestFrame).not.toHaveBeenCalled();

    fake.intersect(true);
    fake.runFrame(1000); // first frame of a run draws at once
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(2);
    fake.runFrame(1020); // 20ms: under the 41.7ms interval
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(2);
    fake.runFrame(1050); // 50ms after the last draw
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(3);
    expect(fake.frames.size).toBe(1);
  });

  it('accumulates time in seconds, scaled by speed, so changing speed never jumps it', () => {
    let speed = 1;
    start({ speed: () => speed });
    fake.intersect(true);
    fake.runFrame(1000);
    fake.runFrame(1100);
    expect(fake.lastUniform('u_time')![0]).toBeCloseTo(0.1, 5);
    speed = 0.3;
    fake.runFrame(1200);
    expect(fake.lastUniform('u_time')![0]).toBeCloseTo(0.1 + 0.03, 5);
  });

  it('caps one frame step at 0.2 s so a resumed tab never jumps', () => {
    start();
    fake.intersect(true);
    fake.runFrame(1000);
    fake.runFrame(61000);
    expect(fake.lastUniform('u_time')![0]).toBeCloseTo(0.2, 5);
  });

  it('stops asking for frames off screen and resumes when it returns', () => {
    start();
    fake.intersect(true);
    fake.runFrame(1000);
    fake.intersect(false);
    expect(fake.frames.size).toBe(0);
    fake.intersect(true);
    expect(fake.frames.size).toBe(1);
  });

  it('pauses while the tab is hidden and resumes when it is visible again', () => {
    start();
    fake.intersect(true);
    fake.runFrame(1000);
    expect(fake.frames.size).toBe(1);

    fake.setHidden(true);
    expect(fake.frames.size).toBe(0);
    const requested = fake.requestFrame.mock.calls.length;
    const drawn = fake.gl.drawArrays.mock.calls.length;
    expect(fake.requestFrame).toHaveBeenCalledTimes(requested);
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(drawn);

    fake.setHidden(false);
    expect(fake.frames.size).toBe(1);
  });

  it('does not draw from a frame that fires after the tab was hidden', () => {
    start();
    fake.intersect(true);
    const drawn = fake.gl.drawArrays.mock.calls.length;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    fake.runFrame(5000);
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(drawn);
    expect(fake.frames.size).toBe(0);
  });

  it('draws one still frame and never schedules a frame when still', () => {
    start({ still: true });
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(1);
    fake.intersect(true);
    fake.setHidden(false);
    expect(fake.requestFrame).not.toHaveBeenCalled();
    expect(fake.frames.size).toBe(0);
    // A resize still repaints the one frame.
    fake.resize();
    expect(fake.gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(fake.requestFrame).not.toHaveBeenCalled();
  });

  it('redraw() repaints now with the current uniforms', () => {
    let level = 0.2;
    const runner = start({ still: true, uniforms: () => ({ u_level: level }) });
    level = 0.9;
    runner!.redraw();
    expect(fake.lastUniform('u_level')).toEqual([0.9]);
  });
});

describe('createGlRunner: tear-down', () => {
  it('cancels its frame, disconnects observers and loses the context on dispose', () => {
    const runner = start();
    fake.intersect(true);
    expect(fake.frames.size).toBe(1);
    runner!.dispose();
    expect(fake.frames.size).toBe(0);
    expect(fake.disconnects).toHaveBeenCalledTimes(2);
    expect(fake.loseContext).toHaveBeenCalledTimes(1);
    expect(fake.gl.deleteProgram).toHaveBeenCalled();
    expect(fake.gl.deleteBuffer).toHaveBeenCalled();
  });

  it('stops reacting to the tab once disposed', () => {
    const runner = start();
    fake.intersect(true);
    runner!.dispose();
    fake.setHidden(true);
    fake.setHidden(false);
    expect(fake.frames.size).toBe(0);
  });

  it('calls onLost, and stops, when the browser takes the context away', () => {
    const onLost = vi.fn();
    start({ onLost });
    fake.intersect(true);
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(fake.frames.size).toBe(0);
  });

  it('does not report its own dispose as a lost context', () => {
    const onLost = vi.fn();
    const runner = start({ onLost });
    runner!.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).not.toHaveBeenCalled();
  });
});

describe('readSwissColor', () => {
  const withToken = (value: string) => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => (name === '--sw-test' ? value : ''),
    } as unknown as CSSStyleDeclaration);
    return document.createElement('div');
  };

  it('reads a 6-digit hex token as 0-1 channels, ignoring the padding custom properties keep', () => {
    expect(readSwissColor(withToken(' #f0f0e8 '), '--sw-test')).toEqual([
      240 / 255,
      240 / 255,
      232 / 255,
    ]);
  });

  it('reads a 3-digit hex token', () => {
    expect(readSwissColor(withToken('#fff'), '--sw-test')).toEqual([1, 1, 1]);
  });

  it('falls back to black, without throwing, when the token is missing (jsdom, print routes)', () => {
    expect(readSwissColor(withToken(''), '--sw-test')).toEqual([0, 0, 0]);
    expect(readSwissColor(withToken('not-a-colour'), '--sw-test')).toEqual([0, 0, 0]);
  });
});
