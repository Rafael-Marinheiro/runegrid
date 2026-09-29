import { newCreature } from '../../models/creature-factory';
import { mapFromAscii } from '../../models/grid';
import { dispatch, newEncounter } from '../encounter';
import { exportFoundryScene, importFoundryScene } from './foundry';

const ctx = { rng: () => 0.5, role: { kind: 'dm' } as const };

describe('Foundry VTT', () => {
  it('preserva mapa, portas e tokens no round-trip', () => {
    let state = newEncounter(mapFromAscii(['#####', '#.DL#', '#####']), 'Portões');
    state = dispatch(
      state,
      {
        type: 'addCreature',
        creature: newCreature('monster', { id: 'guard', name: 'Guarda' }),
        pos: { x: 1, y: 1 },
        hidden: true,
      },
      ctx,
    );
    const exported = exportFoundryScene(state);
    const json = JSON.parse(exported);
    expect(json).toMatchObject({ name: 'Portões', grid: { type: 1, size: 100, distance: 5 } });
    expect(
      json.walls.some((wall: { door: number; ds: number }) => wall.door === 1 && wall.ds === 1),
    ).toBe(true);
    expect(
      json.walls.some((wall: { door: number; ds: number }) => wall.door === 1 && wall.ds === 2),
    ).toBe(true);

    const imported = importFoundryScene(exported)!;
    expect(imported.map.cells).toEqual(state.map.cells);
    expect(imported.tokens[0]).toMatchObject({ pos: { x: 1, y: 1 }, hidden: true });
    expect(imported.creatures[0].name).toBe('Guarda');
  });

  it('rasteriza uma cena Foundry externa e rejeita arquivo inválido', () => {
    const imported = importFoundryScene(
      JSON.stringify({
        name: 'Importada',
        width: 300,
        height: 300,
        grid: { size: 100 },
        walls: [{ c: [0, 100, 300, 100], door: 0 }],
        tokens: [{ name: 'Orc', x: 100, y: 100, width: 1, disposition: -1 }],
      }),
    )!;
    expect(imported.name).toBe('Importada');
    expect(imported.map.cells.slice(0, 3)).toEqual(['wall', 'wall', 'wall']);
    expect(imported.creatures[0]).toMatchObject({ name: 'Orc', kind: 'monster' });
    expect(importFoundryScene('{"grid":{}}')).toBeNull();
  });
});
