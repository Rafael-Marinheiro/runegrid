import { mulberry32 } from '@core/rules/dice';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import {
  baseValues,
  cross,
  DieKind,
  dot,
  faceNormal,
  norm,
  relabel,
  Shape,
  shapeFor,
  splitD100,
  sub,
  Vec3,
} from './dice-shapes';

export interface StageDie {
  sides: number;
  value: number;
  dropped: boolean;
  highlight: 'crit' | 'fumble' | null;
}

/** Um dado físico. Um d100 vira dois d10 (dezenas e unidades). */
interface Physical {
  kind: DieKind;
  /** d10/d100 usam faces 0–9. */
  zeroBased: boolean;
  tens: boolean;
  /** Lados do dado que o jogador rolou (d100 = 100), para achar a cor do tipo. */
  sides: number;
  target: number;
  dropped: boolean;
  highlight: StageDie['highlight'];
}

const SUPPORTED = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_PHYSICAL = 12;
const RADIUS = 1.15;
const STEP = 1 / 60;
const MAX_FRAMES = 360;
const FOV = 38;
const CAM = new THREE.Vector3(0, 9, 4.5);
const CELL = 192;
/** cos(~10°): a face de cima precisa ficar quase na horizontal. */
const FLAT = 0.97;
const RETRIES = 3;

function expand(dice: StageDie[]): Physical[] {
  return dice.flatMap((d): Physical[] => {
    const rest = { dropped: d.dropped, highlight: d.highlight };
    if (d.sides === 100) {
      const { tens, units } = splitD100(d.value);
      return [
        { kind: 10, sides: 100, zeroBased: true, tens: true, target: tens, ...rest },
        { kind: 10, sides: 100, zeroBased: true, tens: false, target: units, ...rest },
      ];
    }
    return [
      {
        kind: d.sides as DieKind,
        sides: d.sides,
        zeroBased: false,
        tens: false,
        target: d.value,
        ...rest,
      },
    ];
  });
}

interface Sim {
  frames: Float32Array[];
  up: number[];
  /** Algum dado terminou inclinado, por cima de outro ou sobreposto: o resultado poderia ficar escondido. */
  messy: boolean;
}

/** Simula a queda (cannon-es) e guarda cada quadro; devolve também qual face/vértice ficou para cima. */
export function simulate(kinds: DieKind[], seed: number, hx: number, hz: number): Sim {
  const rng = mulberry32(seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -55, 0) });
  world.allowSleep = true;
  const mat = new CANNON.Material('die');
  world.addContactMaterial(
    new CANNON.ContactMaterial(mat, mat, { friction: 0.3, restitution: 0.3 }),
  );

  const wall = (x: number, z: number, ey: number, ex = 0) => {
    const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
    b.position.set(x, 0, z);
    b.quaternion.setFromEuler(ex, ey, 0);
    world.addBody(b);
  };
  wall(0, 0, 0, -Math.PI / 2); // chão (normal +y)
  wall(-hx, 0, Math.PI / 2);
  wall(hx, 0, -Math.PI / 2);
  wall(0, -hz, 0);
  wall(0, hz, Math.PI);

  const n = kinds.length;
  const bodies = kinds.map((kind, i) => {
    const s = shapeFor(kind);
    const shape = new CANNON.ConvexPolyhedron({
      vertices: s.vertices.map((v) => new CANNON.Vec3(v[0] * RADIUS, v[1] * RADIUS, v[2] * RADIUS)),
      faces: s.faces,
    });
    const b = new CANNON.Body({
      mass: 1,
      material: mat,
      shape,
      sleepSpeedLimit: 0.5,
      sleepTimeLimit: 0.25,
      linearDamping: 0.1,
      angularDamping: 0.15,
    });
    b.allowSleep = true;
    b.position.set(-hx + 2 + rng() * 1.5, 3 + i * 2.6, (rng() - 0.5) * hz * 1.4);
    b.quaternion.setFromEuler(rng() * 6.28, rng() * 6.28, rng() * 6.28);
    b.velocity.set(13 + rng() * 8, -2, (rng() - 0.5) * 6);
    b.angularVelocity.set((rng() - 0.5) * 40, (rng() - 0.5) * 40, (rng() - 0.5) * 40);
    world.addBody(b);
    return b;
  });

  const frames: Float32Array[] = [];
  let calm = 0;
  for (let f = 0; f < MAX_FRAMES; f++) {
    world.step(STEP);
    const frame = new Float32Array(n * 7);
    bodies.forEach((b, i) => {
      const { x, y, z } = b.position;
      const q = b.quaternion;
      frame.set([x, y, z, q.x, q.y, q.z, q.w], i * 7);
    });
    frames.push(frame);
    const still = bodies.every(
      (b) =>
        b.sleepState === CANNON.Body.SLEEPING ||
        (b.velocity.lengthSquared() < 0.04 && b.angularVelocity.lengthSquared() < 0.08),
    );
    calm = still ? calm + 1 : 0;
    if (calm >= 20) break;
  }
  for (let i = 0; i < 20; i++) frames.push(frames[frames.length - 1]); // respiro no fim

  const out = new CANNON.Vec3();
  let tilt = 1;
  const up = bodies.map((b, i) => {
    const s = shapeFor(kinds[i]);
    const dirs: Vec3[] = s.byVertex ? s.vertices : s.faces.map((f) => faceNormal(s.vertices, f));
    const ys = dirs.map((d) => {
      b.quaternion.vmult(new CANNON.Vec3(d[0], d[1], d[2]), out);
      return out.y;
    });
    tilt = Math.min(tilt, Math.max(...ys));
    return ys.indexOf(Math.max(...ys));
  });
  const rest = kinds.map(restHeight);
  let messy = tilt <= FLAT;
  bodies.forEach((b, i) => {
    if (b.position.y > rest[i] * 1.35) messy = true; // apoiado em outro dado
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(
        b.position.x - bodies[j].position.x,
        b.position.z - bodies[j].position.z,
      );
      if (d < rest[i] + rest[j]) messy = true; // sobrepostos
    }
  });
  return { frames, up, messy };
}

/** Altura do centro do dado quando apoiado numa face (a distância do centro ao plano da face). */
export function restHeight(kind: DieKind): number {
  const s = shapeFor(kind);
  const f = s.faces[0];
  return RADIUS * dot(faceNormal(s.vertices, f), s.vertices[f[0]]);
}

const UP = new THREE.Vector3(0, 1, 0);
const SETTLE_FRAMES = 24;

/**
 * Garante o resultado legível: desliza cada dado até o chão, endireita-o com a face do
 * resultado para cima e afasta os dados entre si. Acrescenta quadros ao fim da simulação.
 */
export function settle(sim: Sim, kinds: DieKind[], hx: number, hz: number): Float32Array[] {
  const last = sim.frames[sim.frames.length - 1];
  const n = kinds.length;
  const rest = kinds.map(restHeight);

  const from = kinds.map((_, i) => ({
    p: new THREE.Vector3(last[i * 7], last[i * 7 + 1], last[i * 7 + 2]),
    q: new THREE.Quaternion(last[i * 7 + 3], last[i * 7 + 4], last[i * 7 + 5], last[i * 7 + 6]),
  }));
  const to = from.map((st, i) => {
    const s = shapeFor(kinds[i]);
    const dir = s.byVertex ? s.vertices[sim.up[i]] : faceNormal(s.vertices, s.faces[sim.up[i]]);
    const world = new THREE.Vector3(dir[0], dir[1], dir[2]).applyQuaternion(st.q);
    const q = new THREE.Quaternion().setFromUnitVectors(world, UP).multiply(st.q);
    return { p: new THREE.Vector3(st.p.x, rest[i], st.p.z), q };
  });

  // afasta os dados que ficaram sobrepostos, sem sair da bandeja
  const gap = (i: number, j: number) => (rest[i] + rest[j]) * 1.25 + 0.15;
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = to[j].p.x - to[i].p.x;
        const dz = to[j].p.z - to[i].p.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        const need = gap(i, j);
        if (d >= need) continue;
        const push = (need - d) / 2;
        const ux = dx === 0 && dz === 0 ? 1 : dx / d;
        const uz = dx === 0 && dz === 0 ? 0 : dz / d;
        to[i].p.x -= ux * push;
        to[i].p.z -= uz * push;
        to[j].p.x += ux * push;
        to[j].p.z += uz * push;
      }
    }
    to.forEach((t, i) => {
      t.p.x = Math.max(-hx + rest[i] + 0.3, Math.min(hx - rest[i] - 0.3, t.p.x));
      t.p.z = Math.max(-hz + rest[i] + 0.3, Math.min(hz - rest[i] - 0.3, t.p.z));
    });
  }

  const frames = sim.frames.slice(0, sim.frames.length - 20);
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  for (let k = 1; k <= SETTLE_FRAMES; k++) {
    const t = k / SETTLE_FRAMES;
    const e = t * t * (3 - 2 * t); // suaviza início e fim
    const frame = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      p.lerpVectors(from[i].p, to[i].p, e);
      q.slerpQuaternions(from[i].q, to[i].q, e);
      frame.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], i * 7);
    }
    frames.push(frame);
  }
  for (let i = 0; i < 20; i++) frames.push(frames[frames.length - 1]);
  return frames;
}

interface FaceLayout {
  pts: [number, number][];
  cx: number;
  cy: number;
  inradius: number;
}

/** Projeta a face no plano da textura: centro da célula = centroide; "cima" = direção do 1º vértice. */
function layoutFace(s: Shape, fi: number, cx: number, cy: number): FaceLayout {
  const f = s.faces[fi];
  const nrm = faceNormal(s.vertices, f);
  const c: Vec3 = [0, 0, 0];
  f.forEach((i) => s.vertices[i].forEach((x, a) => (c[a] += x / f.length)));
  const up = norm(sub(s.vertices[f[0]], c));
  const right = cross(up, nrm);
  const p2 = f.map((i) => {
    const d = sub(s.vertices[i], c);
    return [dot(d, right), dot(d, up)] as [number, number];
  });
  const k = (0.46 * CELL) / Math.max(...p2.map(([x, y]) => Math.hypot(x, y)));
  const pts = p2.map(([x, y]) => [cx + x * k, cy - y * k] as [number, number]);
  let inradius = Infinity;
  pts.forEach(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    inradius = Math.min(inradius, Math.abs((x2 - x1) * (y1 - cy) - (x1 - cx) * (y2 - y1)) / len);
  });
  return { pts, cx, cy, inradius };
}

/** Lê um token de design (styles.scss), a fonte única das cores. */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function dieColor(sides: number): string {
  return cssVar(`--die-d${sides}`, '#2b2119');
}

function text(v: number, p: Physical): string {
  return p.tens ? (v === 0 ? '00' : String(v * 10)) : String(v);
}

function buildMesh(p: Physical, up: number): THREE.Mesh {
  const s = shapeFor(p.kind);
  const values = relabel(baseValues(p.kind, p.zeroBased), up, p.target);
  const F = s.faces.length;
  const cols = Math.ceil(Math.sqrt(F));
  const rows = Math.ceil(F / cols);
  const W = cols * CELL;
  const H = rows * CELL;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const body = dieColor(p.sides);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);
  const textColor = cssVar('--die-text', '#f6ecd6');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const layouts = s.faces.map((_, fi) =>
    layoutFace(s, fi, ((fi % cols) + 0.5) * CELL, (Math.floor(fi / cols) + 0.5) * CELL),
  );
  layouts.forEach((lay, fi) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    lay.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = textColor;
    if (s.byVertex) {
      // d4: o número de cada vértice aparece perto do canto, nas três faces vizinhas
      s.faces[fi].forEach((vi, k) => {
        const [x, y] = lay.pts[k];
        ctx.font = `700 ${CELL * 0.2}px "Alegreya Sans", sans-serif`;
        ctx.fillText(String(values[vi]), lay.cx + (x - lay.cx) * 0.6, lay.cy + (y - lay.cy) * 0.6);
      });
    } else {
      const label = text(values[fi], p);
      const px = Math.min(CELL * 0.6, lay.inradius * (label.length > 1 ? 1.15 : 1.55));
      ctx.font = `700 ${px}px "Alegreya Sans", sans-serif`;
      ctx.fillText(label, lay.cx, lay.cy + px * 0.05);
    }
  });

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  s.faces.forEach((f, fi) => {
    const n = faceNormal(s.vertices, f);
    for (let t = 1; t < f.length - 1; t++) {
      for (const k of [0, t, t + 1]) {
        const v = s.vertices[f[k]];
        pos.push(v[0] * RADIUS, v[1] * RADIUS, v[2] * RADIUS);
        nor.push(...n);
        uv.push(layouts[fi].pts[k][0] / W, 1 - layouts[fi].pts[k][1] / H);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.3 }),
  );
  mesh.castShadow = true;
  return mesh;
}

export class DiceStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 2.4, 0.1, 100);
  private meshes: THREE.Mesh[] = [];
  private token = 0;

  /** Lança se o WebGL não estiver disponível. */
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.camera.position.copy(CAM);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(4, 10, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8 });
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.ShadowMaterial({ opacity: 0.5 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  static supports(dice: StageDie[]): boolean {
    return dice.every((d) => SUPPORTED.has(d.sides)) && expand(dice).length <= MAX_PHYSICAL;
  }

  /** Resolve `true` quando os dados pararam, `false` se outra rolagem interrompeu esta. */
  async roll(dice: StageDie[], seed: number): Promise<boolean> {
    const token = ++this.token;
    try {
      await document.fonts.load('700 48px "Alegreya Sans"');
    } catch {
      /* segue com a fonte de reserva */
    }
    if (token !== this.token) return false;

    const w = this.canvas.clientWidth || 720;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const halfW = Math.tan((FOV / 2) * (Math.PI / 180)) * CAM.length() * this.camera.aspect;
    const hx = Math.min(8, Math.max(3.5, halfW * 0.7));

    const phys = expand(dice);
    const kinds = phys.map((p) => p.kind);
    let sim = simulate(kinds, seed, hx, 3.2);
    for (let a = 1; a <= RETRIES && sim.messy; a++) {
      sim = simulate(kinds, seed + a * 7919, hx, 3.2);
    }
    const frames = sim.messy ? settle(sim, kinds, hx, 3.2) : sim.frames;
    this.clear();
    this.meshes = phys.map((p, i) => buildMesh(p, sim.up[i]));
    this.meshes.forEach((m) => this.scene.add(m));

    const finished = await this.play(frames, token);
    if (finished) this.finish(phys);
    return finished;
  }

  private play(frames: Float32Array[], token: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (token !== this.token) return resolve(false);
        const f = Math.max(0, Math.min(frames.length - 1, Math.floor((now - t0) / (1000 * STEP))));
        this.meshes.forEach((m, i) => {
          const a = frames[f];
          m.position.set(a[i * 7], a[i * 7 + 1], a[i * 7 + 2]);
          m.quaternion.set(a[i * 7 + 3], a[i * 7 + 4], a[i * 7 + 5], a[i * 7 + 6]);
        });
        this.renderer.render(this.scene, this.camera);
        if (f >= frames.length - 1) return resolve(true);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Dados descartados escurecem; crítico e falha crítica brilham. */
  private finish(phys: Physical[]): void {
    phys.forEach((p, i) => {
      const mat = this.meshes[i].material as THREE.MeshStandardMaterial;
      if (p.dropped) mat.color.setScalar(0.35);
      if (p.highlight) {
        mat.emissive.set(p.highlight === 'crit' ? 0x2f7a2a : 0x7a2a25);
        mat.emissiveIntensity = 0.7;
      }
    });
    this.renderer.render(this.scene, this.camera);
  }

  private clear(): void {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.token++;
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
