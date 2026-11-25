import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { angleBetween, pointAround, randomOnSphere, rng } from '../../lib/sphere';

export const RADIUS = 10;
export const ROVER_RADIUS = 0.7;

export interface LiveProject {
  id: string;
  name: string;
  tagline: string;
  url: string;
  image?: string;
}

export interface LabProject {
  name: string;
  tagline: string;
}

export interface PlanetData {
  live: LiveProject[];
  lab: LabProject[];
}

/** Circular obstacle on the unit sphere: centre direction and angular radius. */
export interface Obstacle {
  dir: Vector3;
  radius: number;
}

export interface Screen {
  project: LiveProject;
  dir: Vector3;
  /** World-space centre of the picture, its facing normal and the panel's up vector. */
  center: Vector3;
  normal: Vector3;
  up: Vector3;
  pictureHeight: number;
  frame: MeshStandardMaterial;
  hit: Object3D[];
}

export interface World {
  root: Group;
  planet: Mesh;
  obstacles: Obstacle[];
  screens: Screen[];
  lab: { dir: Vector3; hit: Object3D[]; projects: LabProject[] };
  clouds: Group;
  flag: Object3D;
  start: { up: Vector3; heading: Vector3 };
}

const Y = new Vector3(0, 1, 0);
const POLE = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);

/** Orientation that stands an object up on the sphere at `dir`, facing `face` (a tangent). */
function standOn(obj: Object3D, dir: Vector3, face: Vector3, lift = 0): void {
  const z = face.clone().addScaledVector(dir, -face.dot(dir)).normalize();
  const x = new Vector3().crossVectors(dir, z).normalize();
  obj.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, dir, z));
  obj.position.copy(dir).multiplyScalar(RADIUS + lift);
}

function standMatrix(dir: Vector3, twist: number, scale: Vector3, lift = 0): Matrix4 {
  const q = new Quaternion().setFromUnitVectors(Y, dir);
  q.multiply(new Quaternion().setFromAxisAngle(Y, twist));
  return new Matrix4().compose(dir.clone().multiplyScalar(RADIUS + lift), q, scale);
}

/** Cheap 3D value-ish noise from sines; plenty for colouring a few thousand faces. */
function noise3(p: Vector3): number {
  return (
    Math.sin(p.x * 3.1 + p.y * 1.7) * 0.5 +
    Math.sin(p.y * 4.3 - p.z * 2.3) * 0.3 +
    Math.sin(p.z * 5.9 + p.x * 3.7) * 0.2
  );
}

function fontFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-sans').trim();
  return v ? `${v}, system-ui, sans-serif` : 'system-ui, sans-serif';
}

function labelTexture(title: string, subtitle: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const family = fontFamily();
    ctx.fillStyle = '#16131a';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 192, 36);
    ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(70, 96, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5efe8';
    ctx.font = `650 76px ${family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, 116, 104, 860);
    ctx.fillStyle = '#b9aea4';
    ctx.font = `400 38px ${family}`;
    ctx.fillText(subtitle, 116, 156, 860);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function signTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 128, 28);
    ctx.fill();
    ctx.fillStyle = '#1a0d05';
    ctx.font = `700 64px ${fontFamily()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 470);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ---------- planet surface ----------

function buildPlanet(roads: Vector3[][]): Mesh {
  const geo = new IcosahedronGeometry(RADIUS, 14); // already non-indexed: one colour per face
  const pos = geo.getAttribute('position');
  const colors: number[] = [];
  const grass = [new Color('#5fbf4a'), new Color('#6fcb55'), new Color('#4fae43')];
  const meadow = new Color('#9bd65a');
  const sand = new Color('#e8cf96');
  const sandEdge = new Color('#cdbb7a');
  const c = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const col = new Color();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(a.fromBufferAttribute(pos, i + k));
    c.normalize();
    // Distance to the nearest road (sampled geodesics from the landing zone to each screen).
    let road = Infinity;
    for (const path of roads) {
      for (const p of path) road = Math.min(road, angleBetween(c, p));
    }
    const n = noise3(b.copy(c).multiplyScalar(3));
    const g = grass[Math.floor(((n + 1) / 2) * 2.999)] ?? grass[0];
    col.copy(g ?? meadow);
    if (noise3(b.copy(c).multiplyScalar(1.3).addScalar(4)) > 0.55) col.lerp(meadow, 0.6);
    if (road < 0.05) col.copy(sand);
    else if (road < 0.075) col.copy(sandEdge).lerp(col, 0.4);
    // Subtle per-face jitter for a hand-made low-poly look.
    col.offsetHSL(0, 0, (((i * 2654435761) % 1000) / 1000) * 0.03 - 0.015);
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function geodesic(from: Vector3, to: Vector3, steps: number): Vector3[] {
  const out: Vector3[] = [];
  const angle = angleBetween(from, to);
  const axis = new Vector3().crossVectors(from, to).normalize();
  for (let i = 0; i <= steps; i++) {
    out.push(from.clone().applyAxisAngle(axis, (angle * i) / steps));
  }
  return out;
}

// ---------- props ----------

function buildScreen(
  project: LiveProject,
  dir: Vector3,
  face: Vector3,
  loader: TextureLoader,
): { screen: Screen; group: Group } {
  const g = new Group();
  standOn(g, dir, face);

  const postMat = new MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.6 });
  const postGeo = new CylinderGeometry(0.09, 0.11, 2.1, 10);
  for (const x of [-1.45, 1.45]) {
    const post = new Mesh(postGeo, postMat);
    post.position.set(x, 1.05, 0);
    post.castShadow = true;
    g.add(post);
  }

  const frame = new MeshStandardMaterial({
    color: '#1c1920',
    roughness: 0.45,
    metalness: 0.1,
    emissive: new Color('#ff7a1a'),
    emissiveIntensity: 0,
  });
  const panelY = 2.55;
  const panel = new Mesh(new RoundedBoxGeometry(3.7, 2.45, 0.18, 4, 0.1), frame);
  panel.position.set(0, panelY, 0);
  panel.castShadow = true;
  g.add(panel);

  const picW = 3.4;
  const picH = picW / 1.6;
  const picMat = new MeshBasicMaterial({ color: '#2a2530', toneMapped: false });
  const picture = new Mesh(new PlaneGeometry(picW, picH), picMat);
  picture.position.set(0, panelY, 0.1);
  g.add(picture);
  if (project.image) {
    loader.load(project.image, (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 8;
      picMat.map = tex;
      picMat.color.set('#ffffff');
      picMat.needsUpdate = true;
    });
  }

  const label = new Mesh(
    new PlaneGeometry(3.7, 0.69),
    new MeshBasicMaterial({
      map: labelTexture(project.name, project.tagline),
      transparent: true,
      toneMapped: false,
    }),
  );
  label.position.set(0, 0.95, 0.12);
  g.add(label);
  const back = new Mesh(
    new PlaneGeometry(3.7, 0.69),
    new MeshStandardMaterial({ color: '#1c1920' }),
  );
  back.position.set(0, 0.95, 0.11);
  back.rotation.y = Math.PI;
  g.add(back);

  g.updateMatrixWorld(true);
  const center = picture.getWorldPosition(new Vector3());
  const normal = new Vector3(0, 0, 1).applyQuaternion(g.quaternion);
  const up = dir.clone();
  return {
    screen: {
      project,
      dir: dir.clone(),
      center,
      normal,
      up,
      pictureHeight: picH,
      frame,
      hit: [panel, picture, label],
    },
    group: g,
  };
}

function buildLab(dir: Vector3, face: Vector3): { group: Group; hit: Object3D[] } {
  const g = new Group();
  standOn(g, dir, face);
  const dome = new Mesh(
    new SphereGeometry(1.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.35, metalness: 0.05 }),
  );
  dome.castShadow = true;
  dome.receiveShadow = true;
  g.add(dome);
  const ring = new Mesh(
    new TorusGeometry(1.72, 0.09, 8, 48),
    new MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 0.6 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.35;
  g.add(ring);
  const door = new Mesh(
    new PlaneGeometry(0.7, 0.95),
    new MeshStandardMaterial({ color: '#2a2530' }),
  );
  door.position.set(0, 0.48, 1.62);
  door.rotation.x = -0.06;
  g.add(door);
  const sign = new Mesh(
    new PlaneGeometry(1.8, 0.45),
    new MeshBasicMaterial({
      map: signTexture('THE LAB'),
      transparent: true,
      toneMapped: false,
      side: DoubleSide,
    }),
  );
  sign.position.set(0, 2.05, 0);
  g.add(sign);
  const antenna = new Mesh(
    new CylinderGeometry(0.03, 0.03, 0.8, 6),
    new MeshStandardMaterial({ color: '#cfcac2' }),
  );
  antenna.position.y = 2.6;
  g.add(antenna);
  const beacon = new Mesh(
    new SphereGeometry(0.1, 12, 8),
    new MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 2 }),
  );
  beacon.position.y = 3.0;
  beacon.name = 'beacon';
  g.add(beacon);
  return { group: g, hit: [dome, sign, door] };
}

function buildFlag(dir: Vector3, face: Vector3): Group {
  const g = new Group();
  standOn(g, dir, face);
  const pole = new Mesh(
    new CylinderGeometry(0.04, 0.05, 2.2, 8),
    new MeshStandardMaterial({ color: '#e9e4dc' }),
  );
  pole.position.y = 1.1;
  pole.castShadow = true;
  g.add(pole);
  const cloth = new Mesh(
    new PlaneGeometry(0.9, 0.55, 6, 1),
    new MeshStandardMaterial({ color: '#ff7a1a', side: DoubleSide, roughness: 0.8 }),
  );
  cloth.position.set(0.47, 1.9, 0);
  cloth.castShadow = true;
  cloth.name = 'cloth';
  g.add(cloth);
  return g;
}

function buildClouds(rand: () => number): Group {
  const g = new Group();
  const geo = new IcosahedronGeometry(1, 1);
  const mat = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    flatShading: true,
    emissive: '#ffffff',
    emissiveIntensity: 0.35, // keeps the undersides white instead of picking up the green ground light
  });
  const puffs = 11;
  const mesh = new InstancedMesh(geo, mat, puffs * 4);
  let n = 0;
  const p = new Vector3();
  for (let i = 0; i < puffs; i++) {
    randomOnSphere(rand, p);
    const height = RADIUS + 5 + rand() * 2.5;
    const q = new Quaternion().setFromUnitVectors(Y, p);
    for (let k = 0; k < 4; k++) {
      const local = new Vector3((k - 1.5) * 0.75, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.6);
      const s = 0.55 + rand() * 0.45 - Math.abs(k - 1.5) * 0.12;
      const m = new Matrix4().compose(
        p.clone().multiplyScalar(height).add(local.applyQuaternion(q)),
        q,
        new Vector3(s * 1.2, s * 0.8, s),
      );
      mesh.setMatrixAt(n++, m);
    }
  }
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

// ---------- world ----------

export function buildWorld(data: PlanetData): World {
  const rand = rng(20261125);
  const loader = new TextureLoader();
  const root = new Group();
  const obstacles: Obstacle[] = [];
  const toAngle = (units: number) => units / RADIUS;

  // Landing zone at the north pole; screens fan out in front of the rover.
  const live = data.live;
  const screenDirs: Vector3[] = [];
  live.forEach((_, i) => {
    const ring = Math.floor(i / 5);
    const inRing = Math.min(5, live.length - ring * 5);
    const k = i - ring * 5;
    const spread = inRing === 1 ? 0 : 1.15;
    const az = inRing === 1 ? 0 : -spread + (2 * spread * k) / (inRing - 1);
    screenDirs.push(pointAround(POLE, FORWARD, 0.62 + ring * 0.55, az + ring * 0.5));
  });
  const labDir = pointAround(POLE, FORWARD, 0.95, Math.PI);
  const flagDir = pointAround(POLE, FORWARD, 0.22, Math.PI * 0.75);

  const roads = [...screenDirs, labDir].map((d) => geodesic(POLE, d, 40));
  const planet = buildPlanet(roads);
  root.add(planet);

  const toPole = (d: Vector3) => POLE.clone().addScaledVector(d, -POLE.dot(d)).normalize();

  const screens = live.map((project, i) => {
    const dir = screenDirs[i] ?? POLE;
    const { screen, group } = buildScreen(project, dir, toPole(dir), loader);
    root.add(group);
    // Each post is an obstacle; you can drive under the panel between them.
    const side = new Vector3().crossVectors(dir, toPole(dir)).normalize();
    for (const x of [-1.45, 1.45]) {
      obstacles.push({
        dir: dir.clone().multiplyScalar(RADIUS).addScaledVector(side, x).normalize(),
        radius: toAngle(0.12),
      });
    }
    return screen;
  });

  const lab = buildLab(labDir, toPole(labDir));
  root.add(lab.group);
  obstacles.push({ dir: labDir.clone(), radius: toAngle(1.75) });

  const flag = buildFlag(flagDir, toPole(flagDir).negate());
  root.add(flag);
  obstacles.push({ dir: flagDir.clone(), radius: toAngle(0.08) });

  // Scatter trees and rocks, keeping roads, landmarks and generous gaps clear,
  // so there is always room for the rover to pass between any two obstacles.
  const keepClear: Obstacle[] = [
    { dir: POLE.clone(), radius: 0.32 },
    ...screenDirs.map((d) => ({ dir: d, radius: 0.36 })),
    { dir: labDir, radius: 0.33 },
    { dir: flagDir, radius: 0.08 },
  ];
  const gap = toAngle(ROVER_RADIUS * 2 + 0.6);
  const placed: Obstacle[] = [];
  const free = (d: Vector3, r: number) =>
    keepClear.every((o) => angleBetween(d, o.dir) > o.radius + r) &&
    roads.every((path) => path.every((p) => angleBetween(d, p) > 0.09 + r)) &&
    placed.every((o) => angleBetween(d, o.dir) > o.radius + r + gap);

  const trunkGeo = new CylinderGeometry(0.1, 0.15, 0.8, 7);
  trunkGeo.translate(0, 0.4, 0);
  const roundGeo = new IcosahedronGeometry(0.62, 0);
  roundGeo.translate(0, 1.25, 0);
  const pineGeo = new ConeGeometry(0.6, 1.5, 7);
  pineGeo.translate(0, 1.4, 0);
  const rockGeo = new DodecahedronGeometry(0.5, 0);
  rockGeo.translate(0, 0.15, 0);

  const TREES = 52;
  const ROCKS = 18;
  const trunks = new InstancedMesh(
    trunkGeo,
    new MeshStandardMaterial({ color: '#8a5a3b', flatShading: true }),
    TREES,
  );
  const rounds = new InstancedMesh(
    roundGeo,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    TREES,
  );
  const pines = new InstancedMesh(
    pineGeo,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    TREES,
  );
  const rocks = new InstancedMesh(
    rockGeo,
    new MeshStandardMaterial({ color: '#b8b1a6', flatShading: true }),
    ROCKS,
  );
  const leaf = [
    new Color('#2f9e44'),
    new Color('#3fb950'),
    new Color('#57c15a'),
    new Color('#2b8a3e'),
  ];
  const p = new Vector3();
  let nTrees = 0;
  let nRound = 0;
  let nPine = 0;
  for (let tries = 0; tries < 4000 && nTrees < TREES; tries++) {
    randomOnSphere(rand, p);
    const r = toAngle(0.3);
    if (!free(p, r)) continue;
    const s = 0.8 + rand() * 0.6;
    const scale = new Vector3(s, s, s);
    const twist = rand() * Math.PI * 2;
    trunks.setMatrixAt(nTrees, standMatrix(p, twist, scale));
    const color = leaf[Math.floor(rand() * leaf.length)] ?? leaf[0] ?? new Color('#3fb950');
    if (rand() < 0.55) {
      rounds.setMatrixAt(nRound, standMatrix(p, twist, scale));
      rounds.setColorAt(nRound++, color);
    } else {
      pines.setMatrixAt(nPine, standMatrix(p, twist, scale));
      pines.setColorAt(nPine++, color);
    }
    const o = { dir: p.clone(), radius: toAngle(0.18 * s) };
    placed.push({ dir: o.dir, radius: r });
    obstacles.push(o);
    nTrees++;
  }
  let nRocks = 0;
  for (let tries = 0; tries < 3000 && nRocks < ROCKS; tries++) {
    randomOnSphere(rand, p);
    const s = 0.5 + rand() * 0.9;
    const r = toAngle(0.5 * s);
    if (!free(p, r)) continue;
    rocks.setMatrixAt(
      nRocks++,
      standMatrix(p, rand() * 6.28, new Vector3(s * 1.2, s * 0.7, s), -0.05),
    );
    placed.push({ dir: p.clone(), radius: r });
    obstacles.push({ dir: p.clone(), radius: toAngle(0.45 * s) });
  }
  trunks.count = nTrees;
  rounds.count = nRound;
  pines.count = nPine;
  rocks.count = nRocks;
  for (const m of [trunks, rounds, pines, rocks]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  // Flowers: tiny, no collision.
  const flowerGeo = new IcosahedronGeometry(0.09, 0);
  flowerGeo.translate(0, 0.08, 0);
  const FLOWERS = 220;
  const flowers = new InstancedMesh(
    flowerGeo,
    new MeshStandardMaterial({ roughness: 0.7 }),
    FLOWERS,
  );
  const petals = [
    new Color('#ffffff'),
    new Color('#ffd43b'),
    new Color('#ff8fab'),
    new Color('#ff922b'),
  ];
  let nFlowers = 0;
  for (let tries = 0; tries < 3000 && nFlowers < FLOWERS; tries++) {
    randomOnSphere(rand, p);
    if (!roads.every((path) => path.every((q) => angleBetween(p, q) > 0.08))) continue;
    flowers.setMatrixAt(nFlowers, standMatrix(p, 0, new Vector3(1, 1, 1)));
    flowers.setColorAt(
      nFlowers++,
      petals[Math.floor(rand() * petals.length)] ?? new Color('#ffffff'),
    );
  }
  flowers.count = nFlowers;
  root.add(flowers);

  const clouds = buildClouds(rand);
  root.add(clouds);

  return {
    root,
    planet,
    obstacles,
    screens,
    lab: { dir: labDir, hit: lab.hit, projects: data.lab },
    clouds,
    flag,
    start: { up: POLE.clone(), heading: FORWARD.clone() },
  };
}
