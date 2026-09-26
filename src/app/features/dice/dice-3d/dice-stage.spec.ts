import * as THREE from 'three';
import { DieKind, faceNormal, shapeFor } from './dice-shapes';
import { restHeight, settle, simulate } from './dice-stage';

const KINDS: DieKind[] = [20, 12, 10, 10, 8, 6, 4, 20, 6, 8];
const HX = 6;
const HZ = 3.2;

describe('bandeja 3D: o resultado sempre fica legível', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    'semente %i: face do resultado para cima, dados no chão e sem sobreposição',
    (seed) => {
      const sim = simulate(KINDS, seed, HX, HZ);
      const frames = sim.messy ? settle(sim, KINDS, HX, HZ) : sim.frames;
      const last = frames[frames.length - 1];
      const rest = KINDS.map(restHeight);

      KINDS.forEach((kind, i) => {
        const s = shapeFor(kind);
        const dir = s.byVertex ? s.vertices[sim.up[i]] : faceNormal(s.vertices, s.faces[sim.up[i]]);
        const q = new THREE.Quaternion(
          last[i * 7 + 3],
          last[i * 7 + 4],
          last[i * 7 + 5],
          last[i * 7 + 6],
        );
        const up = new THREE.Vector3(...dir).applyQuaternion(q);
        expect(up.y).toBeGreaterThan(0.96); // a face do resultado aponta para cima
        expect(last[i * 7 + 1]).toBeLessThan(rest[i] * 1.35); // apoiado no chão, não em outro dado
      });

      for (let i = 0; i < KINDS.length; i++) {
        for (let j = i + 1; j < KINDS.length; j++) {
          const d = Math.hypot(last[i * 7] - last[j * 7], last[i * 7 + 2] - last[j * 7 + 2]);
          expect(d).toBeGreaterThanOrEqual(rest[i] + rest[j] - 0.05); // sem sobreposição
        }
      }
    },
  );

  it('a etapa de acerto realmente corrige uma queda ruim', () => {
    // força o caminho de correção: mesmo sem estar "messy", settle deve deixar tudo válido
    const sim = simulate(KINDS, 99, HX, HZ);
    const last = settle(sim, KINDS, HX, HZ).at(-1)!;
    KINDS.forEach((kind, i) => {
      const s = shapeFor(kind);
      const dir = s.byVertex ? s.vertices[sim.up[i]] : faceNormal(s.vertices, s.faces[sim.up[i]]);
      const q = new THREE.Quaternion(
        last[i * 7 + 3],
        last[i * 7 + 4],
        last[i * 7 + 5],
        last[i * 7 + 6],
      );
      expect(new THREE.Vector3(...dir).applyQuaternion(q).y).toBeGreaterThan(0.9999);
      expect(last[i * 7 + 1]).toBeCloseTo(restHeight(kind), 3);
    });
  });
});
