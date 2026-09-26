import { baseValues, DieKind, dot, faceNormal, relabel, shapeFor, splitD100 } from './dice-shapes';

const KINDS: [DieKind, number][] = [
  [4, 4],
  [6, 6],
  [8, 8],
  [10, 10],
  [12, 12],
  [20, 20],
];

describe('shapeFor', () => {
  it.each(KINDS)('d%i tem %i faces', (kind, faces) => {
    expect(shapeFor(kind).faces).toHaveLength(faces);
  });

  it.each(KINDS)('d%i: faces planas, normais para fora e vértices no raio 1', (kind) => {
    const { vertices, faces } = shapeFor(kind);
    for (const face of faces) {
      const n = faceNormal(vertices, face);
      const d = dot(n, vertices[face[0]]);
      expect(d).toBeGreaterThan(0); // para fora
      for (const i of face) expect(dot(n, vertices[i])).toBeCloseTo(d, 5); // plana
      for (const v of vertices) expect(dot(n, v)).toBeLessThanOrEqual(d + 1e-6); // convexa
    }
    expect(Math.max(...vertices.map((v) => Math.hypot(...v)))).toBeCloseTo(1, 6);
  });

  it('cada aresta é compartilhada por exatamente duas faces (sólido fechado)', () => {
    for (const [kind] of KINDS) {
      const edges = new Map<string, number>();
      for (const f of shapeFor(kind).faces) {
        f.forEach((v, i) => {
          const w = f[(i + 1) % f.length];
          const key = [v, w].sort().join('-');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        });
      }
      expect([...edges.values()].every((c) => c === 2)).toBe(true);
    }
  });
});

describe('relabel', () => {
  it('faz a face de cima mostrar o valor pedido, mantendo todos os números', () => {
    const base = baseValues(20);
    const out = relabel(base, 7, 13);
    expect(out[7]).toBe(13);
    expect([...out].sort((a, b) => a - b)).toEqual(base);
  });

  it('valor inexistente lança erro', () => {
    expect(() => relabel(baseValues(6), 0, 9)).toThrow();
  });
});

describe('splitD100', () => {
  it.each([
    [1, 0, 1],
    [10, 1, 0],
    [57, 5, 7],
    [99, 9, 9],
    [100, 0, 0],
  ])('%i → dezenas %i, unidades %i', (v, tens, units) => {
    expect(splitD100(v)).toEqual({ tens, units });
  });
});
