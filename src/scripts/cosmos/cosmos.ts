import { FRAGMENT_SHADER, VERTEX_SHADER } from './shader';

const UNIFORMS = [
  'uRes',
  'uTime',
  'uLaunch',
  'uDrift',
  'uMouse',
  'uSingularity',
  'uFocus',
  'uBoost',
  'uAfter',
] as const;
type UniformName = (typeof UNIFORMS)[number];

/** Max rendered pixels; the soft scene upscales well, so we trade pixels for frame rate. */
const PIXEL_BUDGET = 1_400_000;
const MIN_QUALITY = 0.45;

export interface CosmosState {
  launch: number;
  drift: number;
  mouseX: number;
  mouseY: number;
  singularity: number;
  focusX: number;
  focusY: number;
  /** 0..1 warp kick from scroll velocity; decays on its own. */
  boost: number;
  /** Viewport heights scrolled past the launch sequence (drives planet parallax). */
  after: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

export class Cosmos {
  /** Target values, set from outside (scroll, pointer, theme). */
  readonly target: CosmosState = {
    launch: 0,
    drift: 0,
    mouseX: 0,
    mouseY: 0,
    singularity: 1,
    focusX: 0,
    focusY: 0.07,
    boost: 0,
    after: 0,
  };
  /** Smoothed values actually sent to the GPU. */
  readonly current: CosmosState = { ...this.target };

  onFrame?: (state: CosmosState) => void;

  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private raf = 0;
  private running = false;
  private time = 0;
  private lastNow = 0;
  private quality = 1;
  private frameTimes: number[] = [];
  private resizeObserver: ResizeObserver;
  private readonly animate: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: { animate: boolean },
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.animate = options.animate;
    this.time = 12 + Math.random() * 40; // start mid-flow so the corona is already alive

    this.setup();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Jump smoothed values to their targets (used on first paint and for reduced motion). */
  snap(): void {
    Object.assign(this.current, this.target);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Render one frame without advancing time. */
  renderOnce(): void {
    this.snap();
    this.draw();
  }

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private setup(): void {
    const { gl } = this;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
    }
    gl.useProgram(program);
    this.program = program;
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    gl.bindVertexArray(gl.createVertexArray());
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budgetScale = Math.sqrt(PIXEL_BUDGET / (w * h));
    const scale = Math.min(dpr, budgetScale) * this.quality;
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
      // Resizing clears the canvas; redraw right away so no empty frame is ever shown.
      this.draw();
    } else if (!this.running) {
      this.draw();
    }
  }

  private goodWindows = 0;

  /** Lower resolution if the device struggles (rolling average over ~1 s). */
  private adaptQuality(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    // Step down quickly when struggling, step up only after ~5 s of smooth frames,
    // so the resolution doesn't flip back and forth.
    if (avg > 24 && this.quality > MIN_QUALITY) {
      this.goodWindows = 0;
      this.quality = Math.max(MIN_QUALITY, this.quality - 0.15);
      this.resize();
    } else if (avg < 14 && this.quality < 1) {
      if (++this.goodWindows >= 5) {
        this.goodWindows = 0;
        this.quality = Math.min(1, this.quality + 0.1);
        this.resize();
      }
    } else {
      this.goodWindows = 0;
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    this.time += dt / 1000;
    this.adaptQuality(dt);

    const k = 1 - Math.exp(-dt / 140); // frame-rate independent easing (~140 ms)
    const kSlow = 1 - Math.exp(-dt / 420);
    const c = this.current;
    const t = this.target;
    c.launch = lerp(c.launch, t.launch, k);
    c.drift = lerp(c.drift, t.drift, k);
    c.after = lerp(c.after, t.after, k);
    c.mouseX = lerp(c.mouseX, t.mouseX, kSlow);
    c.mouseY = lerp(c.mouseY, t.mouseY, kSlow);
    c.singularity = lerp(c.singularity, t.singularity, kSlow);
    c.focusX = lerp(c.focusX, t.focusX, k);
    c.focusY = lerp(c.focusY, t.focusY, k);
    t.boost *= Math.exp(-dt / 260);
    c.boost = lerp(c.boost, t.boost, 1 - Math.exp(-dt / 90));

    this.draw();
    this.onFrame?.(c);
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const { gl, uniforms: u, current: c } = this;
    if (!this.program || gl.isContextLost()) return;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uLaunch, c.launch);
    gl.uniform1f(u.uDrift, c.drift);
    gl.uniform2f(u.uMouse, c.mouseX, c.mouseY);
    gl.uniform1f(u.uSingularity, c.singularity);
    gl.uniform2f(u.uFocus, c.focusX, c.focusY);
    gl.uniform1f(u.uBoost, c.boost);
    gl.uniform1f(u.uAfter, c.after);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private onVisibility = (): void => {
    if (!this.animate) return;
    if (document.hidden) this.stop();
    else this.start();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.stop();
    this.program = null;
  };

  private onContextRestored = (): void => {
    this.setup();
    this.resize();
    if (this.animate) this.start();
    else this.renderOnce();
  };
}
