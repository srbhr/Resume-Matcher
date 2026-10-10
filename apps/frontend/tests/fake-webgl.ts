import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * jsdom has no WebGL, no observers and no animation frames. This installs stand-ins for all of
 * them and returns handles to drive the loop by hand, so frame counts and uniforms are exact.
 */
export function installFakeWebGl() {
  // Like a real browser, a canvas whose context was lost hands the same dead context back.
  const requested: HTMLCanvasElement[] = [];
  const lost = new Set<HTMLCanvasElement>();
  const loseContext = vi.fn(() => {
    const last = requested.at(-1);
    if (last) lost.add(last);
  });
  const uniformCalls: { name: string; args: number[] }[] = [];
  const locations = new Map<string, object>();
  const names = new Map<object, string>();

  const record = () =>
    vi.fn((loc: object | null, ...args: number[]) => {
      if (loc) uniformCalls.push({ name: names.get(loc) ?? '?', args });
    });

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 4,
    createShader: vi.fn((type: number) => ({ type })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => 'shader log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => 'program log'),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: object, name: string) => {
      if (!locations.has(name)) {
        const loc = {};
        locations.set(name, loc);
        names.set(loc, name);
      }
      return locations.get(name)!;
    }),
    uniform1f: record(),
    uniform2f: record(),
    uniform3f: record(),
    uniform4f: record(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn((name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null)),
  };

  const dead = { ...gl, createShader: vi.fn(() => null), isContextLost: () => true };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement) {
      if (lost.has(this)) return dead as unknown as WebGLRenderingContext;
      requested.push(this);
      return gl as unknown as WebGLRenderingContext;
    });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 120,
    height: 60,
  } as DOMRect);

  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const requestFrame = vi.fn((cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  const cancelFrame = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);

  let intersect: ((isIntersecting: boolean) => void) | undefined;
  let resized: (() => void) | undefined;
  const disconnects = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (isIntersecting) => act(() => cb([{ isIntersecting }]));
      }
      observe() {}
      disconnect = disconnects;
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resized = () => act(() => cb());
      }
      observe() {}
      disconnect = disconnects;
    }
  );

  return {
    gl,
    getContext,
    /** Every canvas that was given a live context, in order. */
    requested,
    loseContext,
    requestFrame,
    cancelFrame,
    disconnects,
    frames,
    /** The most recent value set for a uniform. */
    lastUniform: (name: string) => uniformCalls.filter((c) => c.name === name).at(-1)?.args,
    /** Every uniform name looked up, i.e. everything the runner set or tried to set. */
    uniformNames: () => [...locations.keys()],
    intersect: (isIntersecting: boolean) => intersect?.(isIntersecting),
    resize: () => resized!(),
    /** Run the queued frame callback at `now` ms, the way the browser would. */
    runFrame(now: number) {
      const [id, cb] = [...frames.entries()][0];
      frames.delete(id);
      act(() => cb(now));
    },
    setHidden(hidden: boolean) {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    },
  };
}
