import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { advance, angleBetween, bearingTo, orthonormalize, pushOut, turn } from '../../lib/sphere';
import { Dust, RoverModel } from './rover';
import {
  buildWorld,
  type PlanetData,
  RADIUS,
  ROVER_RADIUS,
  type Screen,
  type World,
} from './world';

const MAX_SPEED = 7.5;
const MAX_REVERSE = 3;
const ACCEL = 10;
const BRAKE = 18;
const TURN_RATE = 2.4;
const NEAR_SCREEN = 0.42;
const NEAR_LAB = 0.4;
const LAB_DOME = 0.175; // dome radius (1.75 units) in radians

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

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function skyTexture(dark: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (dark) {
      g.addColorStop(0, '#0b0e2e');
      g.addColorStop(0.55, '#3b2766');
      g.addColorStop(1, '#ff9a66');
    } else {
      g.addColorStop(0, '#4f9ff0');
      g.addColorStop(0.6, '#a9d6ff');
      g.addColorStop(1, '#eef8ff');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface Flight {
  t: number;
  screen: Screen;
  fromPos: Vector3;
  fromQuat: Quaternion;
  toPos: Vector3;
  toQuat: Quaternion;
  arrived: boolean;
}

type Nearby = { kind: 'screen'; screen: Screen } | { kind: 'lab' } | null;

class PlanetGame {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(48, 1, 0.1, 200);
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
  private target: Vector3 | null = null;
  private targetBest = Infinity;
  private targetStall = 0;
  private dustClock = 0;
  private wasBumped = false;

  // Camera state.
  private mode: 'overview' | 'chase' = 'overview';
  private readonly camPos = new Vector3();
  private readonly camLook = new Vector3();
  private readonly camUp = new Vector3(0, 1, 0);
  private orbit = 0;
  private snapCamera = true;
  private flight: Flight | null = null;

  private readonly keys = new Set<'f' | 'b' | 'l' | 'r'>();
  private engaged = false;
  private visible = 0;
  private running = false;
  private nearby: Nearby = null;
  private time = 0;
  private quality = 1;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  private readonly io: IntersectionObserver;
  private readonly ro: ResizeObserver;
  private readonly mo: MutationObserver;

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

    this.applyTheme();
    this.placeRover();

    const signal = this.abort.signal;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    this.io = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry?.intersectionRatio ?? 0;
        if (this.visible < 0.3 && this.engaged) this.disengage();
        window.dispatchEvent(new CustomEvent('cosmos:occluded', { detail: this.visible > 0.97 }));
        this.setRunning(this.visible > 0);
      },
      { threshold: [0, 0.05, 0.3, 0.6, 0.97, 1] },
    );
    this.io.observe(root);

    this.mo = new MutationObserver(() => this.applyTheme());
    this.mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener('keydown', this.onKeyDown, { signal });
    window.addEventListener('keyup', (e) => this.keyUp(e), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
    window.addEventListener('pageshow', (e) => e.persisted && this.reset(), { signal });
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('focus', () => this.engage(), { signal });
    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.setRunning(false);
        root.classList.remove('is-ready');
      },
      { signal },
    );

    root.querySelector('[data-planet-start]')?.addEventListener(
      'click',
      () => {
        this.engage();
        canvas.focus({ preventScroll: true });
      },
      { signal },
    );
    root.querySelector('[data-card-open]')?.addEventListener(
      'click',
      () => {
        if (this.nearby?.kind === 'screen') this.open(this.nearby.screen);
      },
      { signal },
    );

    // Compile shaders and upload textures before the first visible frame, to avoid a hitch.
    this.renderer.compile(this.scene, this.camera);
    this.updateCamera(0);
    this.renderer.render(this.scene, this.camera);
    root.classList.add('is-ready');
  }

  destroy(): void {
    this.setRunning(false);
    this.abort.abort();
    this.io.disconnect();
    this.ro.disconnect();
    this.mo.disconnect();
    window.dispatchEvent(new CustomEvent('cosmos:occluded', { detail: false }));
    this.renderer.dispose();
    this.renderer.forceContextLoss();
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
    this.camera.fov = this.camera.aspect < 0.8 ? 64 : 48;
    this.camera.updateProjectionMatrix();
  }

  private adaptQuality(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 22) {
      if (this.quality > 0.55) {
        this.quality = Math.max(0.55, this.quality - 0.15);
        this.resize();
      } else if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.sun.castShadow = false;
      }
    } else if (avg < 13 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.05);
      this.resize();
    }
  }

  private applyTheme(): void {
    const dark = document.documentElement.dataset.theme !== 'light';
    const old = this.scene.background;
    this.scene.background = skyTexture(dark);
    if (old instanceof CanvasTexture) old.dispose();
    this.hemi.color.set(dark ? '#9fa8ff' : '#cfe8ff');
    this.hemi.groundColor.set(dark ? '#3b3050' : '#5c9f45');
    this.hemi.intensity = dark ? 0.95 : 1.25;
    this.sun.color.set(dark ? '#ffb27a' : '#fff6e8');
    this.sun.intensity = dark ? 2.3 : 2.6;
    this.world.setTheme(dark);
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  private reset(): void {
    this.flight = null;
    this.root.classList.remove('is-flying', 'is-arriving');
    this.snapCamera = true;
    this.keys.clear();
  }

  // ---------- input ----------

  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.mode = 'chase';
    this.root.classList.add('is-engaged');
  }

  private disengage(): void {
    this.engaged = false;
    this.keys.clear();
    this.target = null;
    this.root.classList.remove('is-engaged');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.flight || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const dir = KEYMAP[e.code];

    if (!this.engaged) {
      // WASD never scrolls the page, so it may start the game when the planet is in view.
      if (dir && e.code.startsWith('Key') && this.visible > 0.6) this.engage();
      else return;
    }
    if (e.code === 'Escape') {
      this.disengage();
      this.canvas.blur();
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      if (el && /^(BUTTON|A)$/.test(el.tagName)) return; // let buttons handle their own activation
      e.preventDefault();
      if (this.nearby?.kind === 'screen') this.open(this.nearby.screen);
      return;
    }
    if (dir) {
      e.preventDefault();
      this.keys.add(dir);
      this.target = null;
    }
  };

  private keyUp(e: KeyboardEvent): void {
    const dir = KEYMAP[e.code];
    if (dir) this.keys.delete(dir);
  }

  private down: { x: number; y: number; t: number } | null = null;

  private onPointerDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.down;
    this.down = null;
    if (!d || this.flight) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 600) return;
    this.engage();
    const hit = this.pick(e);
    if (!hit) return;
    if (hit.screen) {
      this.open(hit.screen);
    } else {
      this.target = hit.point;
      this.targetBest = Infinity;
      this.targetStall = 0;
    }
  };

  private hoverQueued = false;

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      const hit = this.pick(e);
      this.canvas.style.cursor = hit?.screen ? 'pointer' : 'crosshair';
    });
  };

  private readonly ndc = new Vector2();

  private pick(e: PointerEvent): { screen?: Screen; point: Vector3 } | null {
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
    if (screen) return { screen, point: screen.dir.clone() };
    if (this.world.lab.hit.includes(first.object)) {
      // Drive to the doorstep of the lab.
      const toPole = this.world.start.up.clone().sub(this.world.lab.dir).normalize();
      return { point: this.world.lab.dir.clone().addScaledVector(toPole, 0.24).normalize() };
    }
    return { point: first.point.clone().normalize() };
  }

  // ---------- opening a project ----------

  private open(screen: Screen): void {
    if (this.flight) return;
    this.keys.clear();
    this.target = null;
    if (this.reducedMotion.matches) {
      openInNewTab(screen.project.url);
      return;
    }
    const img = this.root.querySelector<HTMLImageElement>('[data-flyout-img]');
    if (img && screen.project.image) img.src = screen.project.image;

    // Distance at which the picture covers the whole viewport.
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const byHeight = screen.pictureHeight / 2 / half;
    const byWidth = (screen.pictureHeight * 1.6) / 2 / (half * this.camera.aspect);
    const dist = Math.min(byHeight, byWidth) * 0.97;
    const toPos = screen.center.clone().addScaledVector(screen.normal, dist);
    const toQuat = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(toPos, screen.center, screen.up),
    );
    this.flight = {
      t: 0,
      screen,
      fromPos: this.camera.position.clone(),
      fromQuat: this.camera.quaternion.clone(),
      toPos,
      toQuat,
      arrived: false,
    };
    this.root.classList.add('is-flying');
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
    this.updateNearby();

    if (this.flight) this.fly(dt);
    else this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);
  };

  private drive(dt: number): void {
    let throttle = 0;
    let steer = 0;
    if (this.engaged && !this.flight) {
      throttle = (this.keys.has('f') ? 1 : 0) - (this.keys.has('b') ? 1 : 0);
      steer = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0);
      if (this.target) this.autopilot(dt, (t, s) => ((throttle = t), (steer = s)));
    }

    const before = this.speed;
    if (throttle !== 0) {
      const braking = Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.2;
      this.speed += throttle * (braking ? BRAKE : ACCEL) * dt;
    } else {
      this.speed *= Math.exp(-dt * 3.6);
      if (Math.abs(this.speed) < 0.02) this.speed = 0;
    }
    this.speed = clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    const grip = clamp(Math.abs(this.speed) / 2.2, 0, 1) * Math.sign(this.speed);
    turn(this.up, this.heading, -steer * TURN_RATE * grip * dt);
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

  private autopilot(dt: number, set: (throttle: number, steer: number) => void): void {
    const target = this.target;
    if (!target) return;
    const dist = angleBetween(this.up, target);
    if (dist < 0.045) {
      this.target = null;
      return;
    }
    // Give up if we stop making progress (e.g. the target is inside an obstacle).
    if (dist < this.targetBest - 0.01) {
      this.targetBest = dist;
      this.targetStall = 0;
    } else if ((this.targetStall += dt) > 2.5) {
      this.target = null;
      return;
    }
    const b = bearingTo(this.up, this.heading, target);
    const steer = clamp(-b * 2.4, -1, 1);
    const throttle = Math.abs(b) > 1.6 ? 0.35 : dist < 0.15 ? 0.5 : 1;
    set(throttle, steer);
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
      const on = this.nearby?.kind === 'screen' && this.nearby.screen === s;
      const goal = on ? 0.55 + Math.sin(this.time * 4) * 0.25 : 0;
      s.frame.emissiveIntensity += (goal - s.frame.emissiveIntensity) * Math.min(1, dt * 8);
    }
  }

  private updateNearby(): void {
    let best: Nearby = null;
    let bestD = Infinity;
    for (const s of this.world.screens) {
      const d = angleBetween(this.up, s.dir);
      if (d < NEAR_SCREEN && d < bestD) {
        best = { kind: 'screen', screen: s };
        bestD = d;
      }
    }
    // The lab wins whenever you are closer to it than to any screen. Its distance is measured
    // from the dome's edge, since the rover can never reach its centre.
    const lab = angleBetween(this.up, this.world.lab.dir);
    if (lab < NEAR_LAB && lab - LAB_DOME < bestD) best = { kind: 'lab' };
    const same =
      best?.kind === this.nearby?.kind &&
      (best?.kind !== 'screen' ||
        (this.nearby?.kind === 'screen' && this.nearby.screen === best.screen));
    if (same) return;
    this.nearby = best;
    this.renderCard();
  }

  private renderCard(): void {
    const card = this.root.querySelector<HTMLElement>('[data-planet-card]');
    if (!card) return;
    const title = card.querySelector('[data-card-title]');
    const text = card.querySelector('[data-card-text]');
    const button = card.querySelector<HTMLButtonElement>('[data-card-open]');
    const list = card.querySelector<HTMLUListElement>('[data-card-list]');
    const n = this.nearby;
    card.hidden = n === null;
    if (!n || !title || !text || !button || !list) return;
    if (n.kind === 'screen') {
      title.textContent = n.screen.project.name;
      text.textContent = n.screen.project.tagline;
      button.hidden = false;
      button.querySelector('[data-card-label]')?.replaceChildren(`Open ${n.screen.project.name}`);
      list.hidden = true;
    } else {
      title.textContent = 'The lab';
      text.textContent = 'Still on the workbench:';
      button.hidden = true;
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

  private updateCamera(dt: number): void {
    const roverPos = this.rover.group.position;
    const portrait = this.camera.aspect < 0.8;
    if (this.mode === 'overview') {
      // A wide, slowly orbiting shot of the little planet.
      if (!this.reducedMotion.matches) this.orbit += dt * 0.06;
      const back = this.heading
        .clone()
        .negate()
        .applyAxisAngle(this.up, Math.sin(this.orbit) * 0.5);
      this.desiredPos
        .copy(roverPos)
        .addScaledVector(this.up, portrait ? 11 : 8)
        .addScaledVector(back, portrait ? 13 : 12);
      this.desiredLook
        .copy(roverPos)
        .addScaledVector(this.heading, 3)
        .addScaledVector(this.up, -1.5);
    } else {
      const far = portrait ? 1.35 : 1;
      this.desiredPos
        .copy(roverPos)
        .addScaledVector(this.up, 3.3 * far)
        .addScaledVector(this.heading, -6.4 * far);
      this.desiredLook
        .copy(roverPos)
        .addScaledVector(this.heading, 2.4)
        .addScaledVector(this.up, 0.7);
    }
    const k = this.snapCamera ? 1 : 1 - Math.exp(-dt * (this.mode === 'overview' ? 2 : 4.5));
    this.snapCamera = false;
    this.camPos.lerp(this.desiredPos, k);
    this.camLook.lerp(this.desiredLook, k);
    this.camUp.lerp(this.up, k).normalize();
    this.camera.position.copy(this.camPos);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(this.camLook);
  }

  private fly(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / 1.25);
    const e = easeInOutCubic(f.t);
    this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
    this.camera.quaternion.slerpQuaternions(f.fromQuat, f.toQuat, e);
    if (f.t > 0.7) this.root.classList.add('is-arriving');
    if (f.t >= 1 && !f.arrived) {
      f.arrived = true;
      window.setTimeout(() => {
        openInNewTab(f.screen.project.url);
        // Back on the planet: fade the screenshot away and let the camera glide back to the rover.
        window.setTimeout(() => this.returnFromScreen(f.screen), 450);
      }, 220);
    }
  }

  private returnFromScreen(screen: Screen): void {
    this.flight = null;
    this.camPos.copy(this.camera.position);
    this.camLook.copy(screen.center);
    this.camUp.copy(this.camera.up);
    this.root.classList.remove('is-flying', 'is-arriving');
  }
}

/**
 * Open a project in a new tab. The click/keypress that started the flight still counts as a
 * user gesture (browsers allow ~5 s), so this is not blocked as a popup. If it is, fall back
 * to the current tab rather than doing nothing.
 */
function openInNewTab(url: string): void {
  const tab = window.open(url, '_blank');
  if (tab) tab.opener = null;
  else window.location.assign(url);
}

/** Parse the project data embedded in the page and start the game. */
export function mountPlanet(root: HTMLElement): { destroy(): void } | null {
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
