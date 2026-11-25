import {
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const WHEEL_R = 0.27;

/** A friendly little moon rover: white body, orange cabin, bouncy suspension. */
export class RoverModel {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly wheels: Mesh[] = [];
  private readonly steerPivots: Group[] = [];
  private readonly antenna = new Group();
  private bounce = 0;
  private bounceVel = 0;
  private roll = 0;
  private pitch = 0;

  constructor() {
    const white = new MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.45 });
    const orange = new MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.4 });
    const dark = new MeshStandardMaterial({ color: '#2b2731', roughness: 0.8 });
    const glass = new MeshStandardMaterial({ color: '#30405a', roughness: 0.15, metalness: 0.3 });
    const glow = new MeshStandardMaterial({
      color: '#fff3c4',
      emissive: '#ffe08a',
      emissiveIntensity: 1.6,
    });

    const chassis = new Mesh(new RoundedBoxGeometry(1.0, 0.36, 1.45, 3, 0.12), white);
    chassis.position.y = 0.56;
    const cabin = new Mesh(new RoundedBoxGeometry(0.82, 0.42, 0.66, 3, 0.14), orange);
    cabin.position.set(0, 0.92, 0.12);
    const windshield = new Mesh(new RoundedBoxGeometry(0.7, 0.26, 0.05, 2, 0.02), glass);
    windshield.position.set(0, 0.96, -0.22);
    windshield.rotation.x = -0.25;
    const bumper = new Mesh(new RoundedBoxGeometry(1.04, 0.14, 0.16, 2, 0.05), dark);
    bumper.position.set(0, 0.46, -0.74);
    for (const x of [-0.3, 0.3]) {
      const light = new Mesh(new SphereGeometry(0.07, 10, 8), glow);
      light.position.set(x, 0.6, -0.73);
      this.body.add(light);
    }
    for (const m of [chassis, cabin, windshield, bumper]) {
      m.castShadow = true;
      this.body.add(m);
    }

    // Antenna with an orange ball that sways as you drive.
    const mast = new Mesh(new CylinderGeometry(0.018, 0.018, 0.55, 6), dark);
    mast.position.y = 0.27;
    const ball = new Mesh(
      new SphereGeometry(0.07, 12, 8),
      new MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 0.8 }),
    );
    ball.position.y = 0.56;
    this.antenna.add(mast, ball);
    this.antenna.position.set(0.3, 1.12, 0.32);
    this.body.add(this.antenna);
    this.group.add(this.body);

    const wheelGeo = new CylinderGeometry(WHEEL_R, WHEEL_R, 0.22, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new CylinderGeometry(0.11, 0.11, 0.24, 8);
    hubGeo.rotateZ(Math.PI / 2);
    for (const [x, z] of [
      [-0.56, -0.48],
      [0.56, -0.48],
      [-0.56, 0.48],
      [0.56, 0.48],
    ] as const) {
      const pivot = new Group();
      pivot.position.set(x, WHEEL_R, z);
      const wheel = new Mesh(wheelGeo, dark);
      wheel.castShadow = true;
      wheel.add(new Mesh(hubGeo, white));
      pivot.add(wheel);
      this.group.add(pivot);
      this.wheels.push(wheel);
      if (z < 0) this.steerPivots.push(pivot);
    }
  }

  /** Cosmetic animation: wheel spin, steering, body roll/pitch and a springy bounce. */
  animate(dt: number, speed: number, steer: number, accel: number, bump: number): void {
    const spin = (speed * dt) / WHEEL_R;
    for (const w of this.wheels) w.rotation.x -= spin;
    for (const p of this.steerPivots)
      p.rotation.y += (-steer * 0.5 - p.rotation.y) * Math.min(1, dt * 12);

    this.bounceVel += (-this.bounce * 90 - this.bounceVel * 9) * dt + bump;
    this.bounce += this.bounceVel * dt;
    const k = Math.min(1, dt * 6);
    this.roll += (steer * Math.min(1, Math.abs(speed) / 6) * 0.09 - this.roll) * k;
    this.pitch += (accel * 0.012 - this.pitch) * k;
    this.body.position.y =
      this.bounce * 0.08 + Math.sin(performance.now() / 160) * 0.004 * Math.min(1, Math.abs(speed));
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.antenna.rotation.set(-speed * 0.03 + this.pitch * 3, 0, -steer * 0.2 - this.roll * 2);
  }
}

/** Little puffs of dust kicked up behind the wheels, pooled in one instanced mesh. */
export class Dust {
  readonly mesh: InstancedMesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: Vector3[] = [];
  private readonly life: number[] = [];
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly hidden = new Matrix4().makeScale(0, 0, 0);

  constructor(private readonly count = 48) {
    this.mesh = new InstancedMesh(
      new IcosahedronGeometry(0.07, 0),
      new MeshStandardMaterial({ color: '#e9d9b0', roughness: 1, flatShading: true }),
      count,
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.life.push(0);
      this.mesh.setMatrixAt(i, this.hidden);
    }
  }

  emit(at: Vector3, up: Vector3, spread: Vector3): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i]?.copy(at);
    this.vel[i]
      ?.copy(up)
      .multiplyScalar(0.7 + Math.random() * 0.5)
      .addScaledVector(spread, (Math.random() - 0.5) * 1.2);
    this.life[i] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) continue;
      const nl = l - dt * 1.4;
      this.life[i] = nl;
      const p = this.pos[i];
      const v = this.vel[i];
      if (!p || !v) continue;
      if (nl <= 0) {
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      p.addScaledVector(v, dt);
      v.multiplyScalar(1 - dt * 2.5);
      const size = Math.sin(nl * Math.PI) * 1.1 + 0.15;
      this.s.setScalar(size);
      this.m.compose(p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
