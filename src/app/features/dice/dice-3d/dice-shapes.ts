/** Geometria dos dados (sem Three/Cannon): vértices, faces e a regra de rotulagem. */

export type Vec3 = [number, number, number];
export type DieKind = 4 | 6 | 8 | 10 | 12 | 20;

export interface Shape {
  /** Vértices normalizados (raio circunscrito = 1). */
  vertices: Vec3[];
  /** Faces como laços de índices, anti-horário visto de fora. */
  faces: number[][];
  /** d4: o resultado é o vértice voltado para cima, não a face. */
  byVertex: boolean;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

function signs(n: number): number[][] {
  return Array.from({ length: 2 ** n }, (_, i) =>
    Array.from({ length: n }, (_, b) => ((i >> b) & 1 ? 1 : -1)),
  );
}

function vertexSet(kind: DieKind): Vec3[] {
  switch (kind) {
    case 4:
      return [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ];
    case 6:
      return signs(3).map((s) => s as Vec3);
    case 8:
      return [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
    case 12: {
      const a = 1 / PHI;
      const out: Vec3[] = signs(3).map((s) => s as Vec3);
      for (const s1 of [1, -1]) {
        for (const s2 of [1, -1]) {
          out.push([0, s1 * a, s2 * PHI], [s1 * a, s2 * PHI, 0], [s2 * PHI, 0, s1 * a]);
        }
      }
      return out;
    }
    case 20: {
      const out: Vec3[] = [];
      for (const s1 of [1, -1]) {
        for (const s2 of [1, -1]) {
          out.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
        }
      }
      return out;
    }
    case 10:
      return trapezohedron();
  }
}

/** Trapezoedro pentagonal (d10): o ápice é calculado para que as faces (pipas) fiquem planas. */
function trapezohedron(): Vec3[] {
  const b = 0.16;
  const ring: Vec3[] = Array.from({ length: 10 }, (_, k) => {
    const ang = (k * Math.PI) / 5;
    return [Math.cos(ang), k % 2 === 0 ? b : -b, Math.sin(ang)];
  });
  // plano de uma pipa: dois vértices do anel superior e o inferior entre eles
  const n = cross(sub(ring[2], ring[0]), sub(ring[1], ring[0]));
  const apex = dot(n, ring[0]) / n[1];
  return [[0, apex, 0], [0, -apex, 0], ...ring];
}

/** Faces de um sólido convexo: agrupa vértices coplanares e ordena o laço de cada plano. */
export function hullFaces(vertices: Vec3[]): number[][] {
  const seen = new Map<string, number[]>();
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const normal = cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]));
        if (Math.hypot(...normal) < EPS) continue;
        const nn = norm(normal);
        const d = dot(nn, vertices[i]);
        const sign = d >= 0 ? 1 : -1; // origem dentro: normal para fora tem d > 0
        let above = 0;
        const onPlane: number[] = [];
        vertices.forEach((v, idx) => {
          const dist = sign * (dot(nn, v) - d);
          if (Math.abs(dist) < 1e-5) onPlane.push(idx);
          else if (dist > 0) above++;
        });
        if (above > 0) continue; // há vértice fora do plano: não é uma face
        const key = onPlane.join(',');
        if (seen.has(key)) continue;
        seen.set(key, orderLoop(vertices, onPlane, norm(normal.map((c) => c * sign) as Vec3)));
      }
    }
  }
  return [...seen.values()];
}

function orderLoop(vertices: Vec3[], idx: number[], normal: Vec3): number[] {
  const c: Vec3 = [0, 0, 0];
  idx.forEach((i) => vertices[i].forEach((x, a) => (c[a] += x / idx.length)));
  const e1 = norm(sub(vertices[idx[0]], c));
  const e2 = cross(normal, e1);
  return [...idx].sort((p, q) => {
    const ap = Math.atan2(dot(sub(vertices[p], c), e2), dot(sub(vertices[p], c), e1));
    const aq = Math.atan2(dot(sub(vertices[q], c), e2), dot(sub(vertices[q], c), e1));
    return ap - aq;
  });
}

export function faceNormal(vertices: Vec3[], face: number[]): Vec3 {
  const [a, b, c] = face;
  return norm(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a])));
}

const cache = new Map<DieKind, Shape>();

export function shapeFor(kind: DieKind): Shape {
  const cached = cache.get(kind);
  if (cached) return cached;
  const raw = vertexSet(kind);
  const r = Math.max(...raw.map((v) => Math.hypot(...v)));
  const vertices = raw.map((v) => v.map((x) => x / r) as Vec3);
  const faces = hullFaces(vertices);
  const shape: Shape = { vertices, faces, byVertex: kind === 4 };
  cache.set(kind, shape);
  return shape;
}

/** Números impressos em cada face (d4: em cada vértice), na ordem padrão. */
export function baseValues(kind: DieKind, tens = false): number[] {
  if (kind === 10) return Array.from({ length: 10 }, (_, i) => (tens ? i : i + 1));
  return Array.from({ length: kind === 4 ? 4 : kind }, (_, i) => i + 1);
}

/**
 * Rotula o dado para que a face (ou vértice) que ficou para cima mostre `target`:
 * troca de lugar o número que estava lá com o que estava na face de cima.
 */
export function relabel(values: number[], upIndex: number, target: number): number[] {
  const out = [...values];
  const at = out.indexOf(target);
  if (at < 0) throw new Error(`Valor ${target} não existe neste dado`);
  [out[upIndex], out[at]] = [out[at], out[upIndex]];
  return out;
}

/** Um d100 vira dois d10: dezenas (00–90) e unidades (0–9). 100 = "00" + "0". */
export function splitD100(value: number): { tens: number; units: number } {
  return { tens: Math.floor((value % 100) / 10), units: value % 10 };
}
