import { mapFromAscii } from '../../models/grid';
import { hasLineOfSight, visibleCells } from './visibility';

describe('linha de visão', () => {
  const map = mapFromAscii(['..#..', '..d..', '.....']);

  it('mostra o bloqueador, mas não células atrás de paredes ou portas fechadas', () => {
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(hasLineOfSight(map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    expect(hasLineOfSight(map, { x: 0, y: 2 }, { x: 4, y: 2 })).toBe(true);
  });

  it('limita a visão no escuro pelo alcance da criatura', () => {
    const open = mapFromAscii(['..........']);
    const visible = visibleCells(open, [{ pos: { x: 0, y: 0 }, rangeFt: 15 }]);
    expect([...visible]).toEqual([0, 1, 2, 3]);
  });
});
