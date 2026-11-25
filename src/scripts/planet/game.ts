import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { advance, angleBetween, orthonormalize, pushOut, turn } from '../../lib/sphere';
import { Dust, RoverModel } from './rover';
import {
  buildWorld,
  type PlanetData,
  RADIUS,
  ROVER_RADIUS,
  type Screen,
  type World,
} from './world';

const MAX_SPEED = 7;
const MAX_REVERSE = 3;
const ACCEL = 9;
const BRAKE = 18;
const TURN_RATE = 2.3;
const NEAR_SCREEN = 0.42;
const NEAR_LAB = 0.4;
const LAB_DOME = 0.175; // dome radius (1.75 units) in radians
const JOYSTICK_RADIUS = 46; // px

const KEYMAP: Record<string, 'f' | 'b' | 'l' | 'r'> = {
  ArrowUp: 'f',
  KeyW: 'f',
  ArrowDown: 'b',
  KeyS: 'b',
  ArrowLeft: 'l',
  KeyA: 'l',
  ArrowRight: 'r',
  KeyD: 'r',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep receiving a pointer's moves even when it leaves the element (best effort). */
function capture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer may already be gone (e.g. a very quick tap); nothing to capture.
  }
}

function skyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#4f9ff0');
    g.addColorStop(0.6, '#a9d6ff');
    g.addColorStop(1, '#eef8ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

type Spot = { kind: 'screen'; screen: Screen } | { kind: 'lab' } | null;

const sameSpot = (a: Spot, b: Spot) =>
  a?.kind === b?.kind && (a?.kind !== 'screen' || (b?.kind === 'screen' && a.screen === b.screen));

export interface PlanetHandle {
  enter(): void;
  exit(): void;
  destroy(): void;
}

class PlanetGame implements PlanetHandle {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 200);
  private readonly world: World;
  private readonly rover = new RoverModel();
  private readonly dust = new Dust();
  private readonly hemi = new HemisphereLight('#cfe8ff', '#5c9f45', 1.25);
  private readonly sun = new DirectionalLight('#fff6e8', 2.6);
  private readonly raycaster = new Raycaster();
  private readonly abort = new AbortController();

  // Rover state on the unit sphere.
  private readonly up: Vector3;
  private readonly heading: Vector3;
  private speed = 0;
  private dustClock = 0;
  private wasBumped = false;

  // Input.
  private playing = false;
  private readonly keys = new Set<'f' | 'b' | 'l' | 'r'>();
  private readonly stick = { x: 0, y: 0, id: -1 };
  private readonly look = { yaw: 0, pitch: 0, zoom: 1, idle: 0 };
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;

  // Camera.
  private readonly camPos = new Vector3();
  private readonly camLook = new Vector3();
  private readonly camUp = new Vector3(0, 1, 0);
  private snapCamera = true;
  private orbit = 0;

  private nearby: Spot = null;
  private selected: Spot = null;
  private shown: Spot = null;
  private visible = 0;
  private running = false;
  private time = 0;
  private quality = 1;
  private goodWindows = 0;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  private readonly io: IntersectionObserver;
  private readonly ro: ResizeObserver;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    data: PlanetData,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.world = buildWorld(data);
    this.scene.add(
      this.world.root,
      this.rover.group,
      this.dust.mesh,
      this.hemi,
      this.sun,
      this.sun.target,
    );
    this.up = this.world.start.up.clone();
    this.heading = this.world.start.heading.clone();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.radius = 3;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 1;
    sc.far = 60;

    this.applyLighting();
    this.placeRover();

    const signal = this.abort.signal;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    this.io = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry?.intersectionRatio ?? 0;
        this.syncCosmos();
        this.setRunning(this.playing || this.visible > 0);
      },
      { threshold: [0, 0.05, 0.5, 0.97, 1] },
    );
    this.io.observe(root);

    window.addEventListener('keydown', this.onKeyDown, { signal });
    window.addEventListener('keyup', (e) => this.keyUp(e), { signal });
    window.addEventListener('blur', () => this.clearInput(), { signal });
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointercancel', () => (this.drag = null), { signal });
    canvas.addEventListener('wheel', this.onWheel, { signal, passive: false });
    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.setRunning(false);
      },
      { signal },
    );

    const stick = root.querySelector<HTMLElement>('[data-joystick]');
    if (stick) this.bindJoystick(stick, signal);
    root
      .querySelector('[data-planet-exit]')
      ?.addEventListener('click', () => this.exit(), { signal });
    root
      .querySelector('[data-planet-home]')
      ?.addEventListener('click', () => this.home(), { signal });
    root.querySelector('[data-card-close]')?.addEventListener(
      'click',
      () => {
        this.selected = null;
        this.renderCard(null);
      },
      { signal },
    );

    // Compile shaders and upload textures before the first visible frame, to avoid a hitch.
    this.renderer.compile(this.scene, this.camera);
    this.updateCamera(0);
    this.renderer.render(this.scene, this.camera);
    root.classList.add('is-ready');
  }

  // ---------- play mode ----------

  enter(): void {
    if (this.playing) return;
    this.playing = true;
    document.documentElement.classList.add('planet-playing');
    this.root.classList.add('is-playing');
    this.canvas.focus({ preventScroll: true });
    this.syncCosmos();
    this.setRunning(true);
  }

  exit(): void {
    if (!this.playing) return;
    this.playing = false;
    this.clearInput();
    this.selected = null;
    this.nearby = null;
    this.renderCard(null);
    document.documentElement.classList.remove('planet-playing');
    this.root.classList.remove('is-playing');
    this.root
      .querySelector<HTMLButtonElement>('[data-planet-start]')
      ?.focus({ preventScroll: true });
    this.syncCosmos();
  }

  destroy(): void {
    this.exit();
    this.setRunning(false);
    this.abort.abort();
    this.io.disconnect();
    this.ro.disconnect();
    window.dispatchEvent(new CustomEvent('cosmos:occluded', { detail: false }));
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** The background shader has nothing to show while the game covers the screen. */
  private syncCosmos(): void {
    window.dispatchEvent(
      new CustomEvent('cosmos:occluded', { detail: this.playing || this.visible > 0.97 }),
    );
  }

  private home(): void {
    this.up.copy(this.world.start.up);
    this.heading.copy(this.world.start.heading);
    this.speed = 0;
    this.look.yaw = 0;
    this.look.pitch = 0;
    this.selected = null;
  }

  // ---------- lifecycle ----------

  private setRunning(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(on ? this.frame : null);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const base = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(base * this.quality);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    // Resizing clears the canvas; draw straight away so it never flashes empty.
    this.renderer.render(this.scene, this.camera);
  }

  private adaptQuality(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 22) {
      this.goodWindows = 0;
      if (this.quality > 0.55) {
        this.quality = Math.max(0.55, this.quality - 0.15);
        this.resize();
      } else if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.sun.castShadow = false;
      }
    } else if (avg < 13 && this.quality < 1 && ++this.goodWindows >= 5) {
      this.goodWindows = 0;
      this.quality = Math.min(1, this.quality + 0.1);
      this.resize();
    }
  }

  /** The planet is always a sunny day: the one bright place on an otherwise dark site. */
  private applyLighting(): void {
    this.scene.background = skyTexture();
    this.hemi.color.set('#cfe8ff');
    this.hemi.groundColor.set('#5c9f45');
    this.hemi.intensity = 1.25;
    this.sun.color.set('#fff6e8');
    this.sun.intensity = 2.6;
  }

  // ---------- input ----------

  private clearInput(): void {
    this.keys.clear();
    this.stick.x = 0;
    this.stick.y = 0;
    this.stick.id = -1;
    this.drag = null;
    this.root.querySelector<HTMLElement>('[data-joystick-knob]')?.style.removeProperty('translate');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.playing || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.exit();
      return;
    }
    if (e.code === 'Enter') {
      if (el && /^(BUTTON|A)$/.test(el.tagName)) return; // let focused controls handle it
      // Clicking the real link inside a key handler counts as a user gesture: no popup blocking.
      const link = this.root.querySelector<HTMLAnchorElement>('[data-card-open]');
      if (link && !link.hidden && this.shown?.kind === 'screen') {
        e.preventDefault();
        link.click();
      }
      return;
    }
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      this.keys.add(dir);
    }
  };

  private keyUp(e: KeyboardEvent): void {
    const dir = KEYMAP[e.code];
    if (dir) this.keys.delete(dir);
  }

  private bindJoystick(el: HTMLElement, signal: AbortSignal): void {
    const knob = el.querySelector<HTMLElement>('[data-joystick-knob]');
    const update = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > JOYSTICK_RADIUS) {
        dx = (dx / len) * JOYSTICK_RADIUS;
        dy = (dy / len) * JOYSTICK_RADIUS;
      }
      this.stick.x = dx / JOYSTICK_RADIUS;
      this.stick.y = -dy / JOYSTICK_RADIUS;
      knob?.style.setProperty('translate', `${dx}px ${dy}px`);
    };
    el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.stick.id = e.pointerId;
        capture(el, e.pointerId);
        update(e);
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === this.stick.id) update(e);
      },
      { signal },
    );
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = -1;
      this.stick.x = 0;
      this.stick.y = 0;
      knob?.style.removeProperty('translate');
    };
    el.addEventListener('pointerup', release, { signal });
    el.addEventListener('pointercancel', release, { signal });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.playing || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    capture(this.canvas, e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) {
      if (e.pointerType === 'mouse' && this.playing) this.hover(e);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    // Drag to look around the rover.
    this.look.yaw -= dx * 0.008;
    this.look.pitch = clamp(this.look.pitch + dy * 0.005, -0.3, 0.75);
    this.look.idle = 0;
  };

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved) return;
    // A tap selects a screen or the lab (and shows its card); tapping elsewhere clears it.
    this.selected = this.pick(e);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.playing) return;
    e.preventDefault();
    this.look.zoom = clamp(this.look.zoom * Math.exp(e.deltaY * 0.001), 0.7, 1.6);
  };

  private hoverQueued = false;

  private hover(e: PointerEvent): void {
    if (this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      this.canvas.style.cursor = this.pick(e) ? 'pointer' : 'grab';
    });
  }

  private readonly ndc = new Vector2();

  private pick(e: PointerEvent): Spot {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets: Object3D[] = [this.world.planet, ...this.world.lab.hit];
    for (const s of this.world.screens) targets.push(...s.hit);
    const [first] = this.raycaster.intersectObjects(targets, false);
    if (!first) return null;
    const screen = this.world.screens.find((s) => s.hit.includes(first.object));
    if (screen) return { kind: 'screen', screen };
    if (this.world.lab.hit.includes(first.object)) return { kind: 'lab' };
    return null;
  }

  // ---------- simulation ----------

  private frame = (now: number): void => {
    const dtMs = Math.min(now - this.lastFrame, 100);
    this.lastFrame = now;
    const dt = dtMs / 1000;
    this.time += dt;
    this.adaptQuality(dtMs);

    this.drive(dt);
    this.placeRover();
    this.animateWorld(dt);
    this.updateCard();
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private drive(dt: number): void {
    let throttle = 0;
    let steer = 0;
    if (this.playing) {
      throttle = clamp(
        (this.keys.has('f') ? 1 : 0) - (this.keys.has('b') ? 1 : 0) + this.stick.y,
        -1,
        1,
      );
      steer = clamp(
        (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0) + this.stick.x,
        -1,
        1,
      );
    }

    const before = this.speed;
    if (Math.abs(throttle) > 0.05) {
      const braking = Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.2;
      this.speed += throttle * (braking ? BRAKE : ACCEL) * dt;
    } else {
      this.speed *= Math.exp(-dt * 3.6);
      if (Math.abs(this.speed) < 0.02) this.speed = 0;
    }
    this.speed = clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    // The rover can turn on the spot (tank-style) and steers normally when moving.
    // Reversing flips the steering, like a car.
    const moving = clamp(Math.abs(this.speed) / 2.2, 0, 1);
    const reversing = this.speed < -0.2 ? -1 : 1;
    turn(this.up, this.heading, -steer * TURN_RATE * (0.6 + 0.4 * moving) * reversing * dt);
    advance(this.up, this.heading, (this.speed * dt) / RADIUS);

    let bumped = false;
    const roverR = ROVER_RADIUS / RADIUS;
    for (const o of this.world.obstacles) {
      if (pushOut(this.up, o.dir, o.radius + roverR)) bumped = true;
    }
    if (bumped) {
      orthonormalize(this.up, this.heading);
      this.speed *= Math.exp(-dt * 4);
    }
    const bump = bumped && !this.wasBumped ? 0.5 : 0;
    this.wasBumped = bumped;

    const accel = (this.speed - before) / Math.max(dt, 1e-3);
    this.rover.animate(dt, this.speed, steer, accel, bump);

    // While driving, the camera drifts back behind the rover after a moment.
    this.look.idle += dt;
    if (Math.abs(this.speed) > 1 && this.look.idle > 1.2 && !this.drag) {
      const k = 1 - Math.exp(-dt * 1.5);
      this.look.yaw -= Math.atan2(Math.sin(this.look.yaw), Math.cos(this.look.yaw)) * k;
      this.look.pitch -= this.look.pitch * k;
    }

    // Dust behind the rear wheels when moving fast.
    this.dustClock += dt;
    if (Math.abs(this.speed) > 3 && this.dustClock > 0.08) {
      this.dustClock = 0;
      const g = this.rover.group;
      const side = new Vector3(1, 0, 0).applyQuaternion(g.quaternion);
      for (const x of [-0.56, 0.56]) {
        this.dust.emit(
          g.localToWorld(new Vector3(x, 0.08, this.speed > 0 ? 0.55 : -0.55)),
          this.up,
          side,
        );
      }
    }
    this.dust.update(dt);
  }

  private readonly basis = new Matrix4();
  private readonly bx = new Vector3();
  private readonly bz = new Vector3();

  private placeRover(): void {
    const g = this.rover.group;
    g.position.copy(this.up).multiplyScalar(RADIUS);
    this.bz.copy(this.heading).negate();
    this.bx.crossVectors(this.up, this.bz);
    g.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.bx, this.up, this.bz));

    // The sun follows the rover, so wherever you drive it is a sunny afternoon.
    const p = g.position;
    this.sun.position
      .copy(this.up)
      .addScaledVector(this.heading, 0.35)
      .addScaledVector(this.bx, 0.55);
    this.sun.position.normalize().multiplyScalar(25).add(p);
    this.sun.target.position.copy(p);
  }

  private animateWorld(dt: number): void {
    if (!this.reducedMotion.matches) this.world.clouds.rotation.y += dt * 0.02;
    const cloth = this.world.flag.getObjectByName('cloth');
    if (cloth) cloth.rotation.y = Math.sin(this.time * 2.2) * 0.22;
    for (const s of this.world.screens) {
      const on = this.shown?.kind === 'screen' && this.shown.screen === s;
      const goal = on ? 0.55 + Math.sin(this.time * 4) * 0.25 : 0;
      s.frame.emissiveIntensity += (goal - s.frame.emissiveIntensity) * Math.min(1, dt * 8);
    }
  }

  private updateCard(): void {
    if (!this.playing) return;
    let best: Spot = null;
    let bestD = Infinity;
    for (const s of this.world.screens) {
      const d = angleBetween(this.up, s.dir);
      if (d < NEAR_SCREEN && d < bestD) {
        best = { kind: 'screen', screen: s };
        bestD = d;
      }
    }
    // The lab wins whenever you are closer to it than to any screen (measured from its edge).
    const lab = angleBetween(this.up, this.world.lab.dir);
    if (lab < NEAR_LAB && lab - LAB_DOME < bestD) best = { kind: 'lab' };

    // Arriving somewhere new replaces a tapped selection; driving away keeps it.
    if (!sameSpot(best, this.nearby)) {
      this.nearby = best;
      if (best) this.selected = null;
    }
    const spot = this.nearby ?? this.selected;
    if (!sameSpot(spot, this.shown)) this.renderCard(spot);
  }

  private renderCard(spot: Spot): void {
    this.shown = spot;
    const card = this.root.querySelector<HTMLElement>('[data-planet-card]');
    if (!card) return;
    const title = card.querySelector('[data-card-title]');
    const text = card.querySelector('[data-card-text]');
    const link = card.querySelector<HTMLAnchorElement>('[data-card-open]');
    const list = card.querySelector<HTMLUListElement>('[data-card-list]');
    card.hidden = spot === null;
    if (!spot || !title || !text || !link || !list) return;
    if (spot.kind === 'screen') {
      const p = spot.screen.project;
      title.textContent = p.name;
      text.textContent = p.tagline;
      link.href = p.url;
      link.querySelector('[data-card-label]')?.replaceChildren(`Open ${p.name}`);
      link.hidden = false;
      list.hidden = true;
    } else {
      title.textContent = 'The lab';
      text.textContent = 'Still on the workbench:';
      link.hidden = true;
      list.hidden = false;
      list.replaceChildren(
        ...this.world.lab.projects.map((p) => {
          const li = document.createElement('li');
          li.textContent = p.name;
          return li;
        }),
      );
    }
  }

  // ---------- camera ----------

  private readonly desiredPos = new Vector3();
  private readonly desiredLook = new Vector3();
  private readonly back = new Vector3();

  private updateCamera(dt: number): void {
    const roverPos = this.rover.group.position;
    const portrait = this.camera.aspect < 0.8;
    if (!this.playing) {
      // A wide, slowly orbiting shot of the little planet.
      if (!this.reducedMotion.matches) this.orbit += dt * 0.06;
      this.back
        .copy(this.heading)
        .negate()
        .applyAxisAngle(this.up, Math.sin(this.orbit) * 0.5);
      this.desiredPos
        .copy(roverPos)
        .addScaledVector(this.up, portrait ? 11 : 8)
        .addScaledVector(this.back, portrait ? 13 : 12);
      this.desiredLook
        .copy(roverPos)
        .addScaledVector(this.heading, 3)
        .addScaledVector(this.up, -1.5);
    } else {
      // Chase camera that you can swing around the rover by dragging.
      const dist = (portrait ? 9 : 7.2) * this.look.zoom;
      const elevation = 0.46 + this.look.pitch;
      this.back.copy(this.heading).negate().applyAxisAngle(this.up, this.look.yaw);
      this.desiredPos
        .copy(roverPos)
        .addScaledVector(this.back, Math.cos(elevation) * dist)
        .addScaledVector(this.up, Math.sin(elevation) * dist);
      this.desiredLook
        .copy(roverPos)
        .addScaledVector(this.up, 0.9)
        .addScaledVector(this.back, -2.2);
    }
    const k = this.snapCamera ? 1 : 1 - Math.exp(-dt * (this.playing ? 6 : 2));
    this.snapCamera = false;
    this.camPos.lerp(this.desiredPos, k);
    this.camLook.lerp(this.desiredLook, k);
    this.camUp.lerp(this.up, k).normalize();
    this.camera.position.copy(this.camPos);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(this.camLook);
  }
}

/** Parse the project data embedded in the page and start the game. */
export function mountPlanet(root: HTMLElement): PlanetHandle | null {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-planet-canvas]');
  const json = root.querySelector('[data-planet-data]')?.textContent;
  if (!canvas || !json) return null;
  const data = JSON.parse(json) as PlanetData;
  try {
    return new PlanetGame(root, canvas, data);
  } catch {
    root.classList.add('no-webgl');
    return null;
  }
}
