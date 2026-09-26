import { mapFromAscii } from '../../models/grid';
import {
  canStand,
  cellDistanceFt,
  distanceFt,
  findPath,
  footprint,
  key,
  reachable,
} from './movement';

const open = mapFromAscii(['.......', '.......', '.......', '.......', '.......']);
const none = new Set<string>();

describe('mapFromAscii', () => {
  it('lê terrenos e dimensões', () => {
    const m = mapFromAscii(['#.,D', '....']);
    expect(m.width).toBe(4);
    expect(m.height).toBe(2);
    expect(m.cells.slice(0, 4)).toEqual(['wall', 'floor', 'difficult', 'door']);
  });

  it('rejeita linhas de tamanho diferente e caracteres inválidos', () => {
    expect(() => mapFromAscii(['..', '.'])).toThrow();
    expect(() => mapFromAscii(['.x'])).toThrow();
  });
});

describe('distância', () => {
  it('regra simples: diagonal custa 5 ft', () => {
    expect(cellDistanceFt({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
    expect(cellDistanceFt({ x: 0, y: 0 }, { x: 4, y: 1 })).toBe(20);
  });

  it('regra 5-10-5: diagonais alternam 5 e 10', () => {
    expect(cellDistanceFt({ x: 0, y: 0 }, { x: 2, y: 2 }, 'alternate')).toBe(15);
    expect(cellDistanceFt({ x: 0, y: 0 }, { x: 4, y: 4 }, 'alternate')).toBe(30);
  });

  it('criaturas adjacentes estão a 5 ft; grande usa a borda mais próxima', () => {
    expect(distanceFt({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toBe(5);
    expect(distanceFt({ x: 0, y: 0 }, 2, { x: 2, y: 1 }, 1)).toBe(5); // grande em 0..1, alvo em 2
    expect(distanceFt({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1)).toBe(25);
  });

  it('footprint cobre size × size células', () => {
    expect(footprint({ x: 1, y: 1 }, 2).map(key)).toEqual(['1,1', '2,1', '1,2', '2,2']);
  });
});

describe('alcance e caminho', () => {
  it('em terreno aberto alcança um quadrado de raio budget/5', () => {
    const r = reachable({ map: open, start: { x: 3, y: 2 }, size: 1, budgetFt: 10, blocked: none });
    // quadrado 5×5 (raio 2) = 25 células, menos a origem, limitado pelo mapa 7×5
    expect(r).toHaveLength(24);
    expect(r.every((c) => c.costFt <= 10)).toBe(true);
  });

  it('terreno difícil custa o dobro', () => {
    const m = mapFromAscii(['.,.']);
    const p = findPath(
      { map: m, start: { x: 0, y: 0 }, size: 1, budgetFt: 30, blocked: none },
      { x: 2, y: 0 },
    )!;
    expect(p.costFt).toBe(15); // 10 (difícil) + 5
    expect(
      findPath(
        { map: m, start: { x: 0, y: 0 }, size: 1, budgetFt: 10, blocked: none },
        { x: 2, y: 0 },
      ),
    ).toBeNull();
  });

  it('paredes bloqueiam e o caminho contorna', () => {
    const m = mapFromAscii(['.#.', '.#.', '...']);
    const p = findPath(
      { map: m, start: { x: 0, y: 0 }, size: 1, budgetFt: 40, blocked: none },
      { x: 2, y: 0 },
    )!;
    expect(p.costFt).toBe(30); // 6 passos por baixo: as diagonais rente à parede são proibidas
    expect(p.path.some((c) => m.cells[c.y * m.width + c.x] === 'wall')).toBe(false);
  });

  it('não corta quina de parede na diagonal', () => {
    const m = mapFromAscii(['.#', '..']);
    // (0,0) → (1,1) na diagonal passaria rente à parede em (1,0): proibido
    const p = findPath(
      { map: m, start: { x: 0, y: 0 }, size: 1, budgetFt: 20, blocked: none },
      { x: 1, y: 1 },
    )!;
    expect(p.costFt).toBe(10);
  });

  it('outras criaturas bloqueiam; destino ocupado é inalcançável', () => {
    const blocked = new Set(['2,2']);
    expect(
      findPath(
        { map: open, start: { x: 0, y: 2 }, size: 1, budgetFt: 30, blocked },
        { x: 2, y: 2 },
      ),
    ).toBeNull();
    const r = reachable({ map: open, start: { x: 0, y: 2 }, size: 1, budgetFt: 30, blocked });
    expect(r.some((c) => key(c.pos) === '2,2')).toBe(false);
  });

  it('regra 5-10-5 encarece diagonais', () => {
    const q = { map: open, start: { x: 0, y: 0 }, size: 1, budgetFt: 60, blocked: none };
    expect(findPath({ ...q, rule: 'simple' }, { x: 4, y: 4 })!.costFt).toBe(20);
    expect(findPath({ ...q, rule: 'alternate' }, { x: 4, y: 4 })!.costFt).toBe(30);
  });

  it('criatura grande (2×2) não passa onde só cabe uma célula', () => {
    const m = mapFromAscii(['.....', '..#..', '.....']);
    const q = { map: m, start: { x: 0, y: 0 }, budgetFt: 60, blocked: none };
    expect(canStand(m, { x: 0, y: 0 }, 2, none)).toBe(true);
    expect(findPath({ ...q, size: 2 }, { x: 3, y: 0 })).toBeNull();
    expect(findPath({ ...q, size: 1 }, { x: 4, y: 0 })).not.toBeNull();
  });
});
