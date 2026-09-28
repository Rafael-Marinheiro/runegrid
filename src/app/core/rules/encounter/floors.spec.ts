import { newCreature } from '../../models/creature-factory';
import { Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { dispatch } from './reduce';
import { project } from './project';
import { newEncounter } from './state';

const DM: Role = { kind: 'dm' };
const run = (state: ReturnType<typeof newEncounter>, command: Parameters<typeof dispatch>[1]) =>
  dispatch(state, command, { rng: () => 0.5, role: DM });

describe('andares e portais', () => {
  const ground = () => mapFromAscii(['.....', '.....', '.....']);
  const cellar = () => mapFromAscii(['.....', '.....', '.....']);

  it('troca o andar ativo sem perder mapa nem tokens', () => {
    const hero = newCreature('pc', { id: 'hero', name: 'Heroína' });
    let state = run(newEncounter(ground()), {
      type: 'addCreature',
      creature: hero,
      pos: { x: 1, y: 1 },
    });
    state = run(state, { type: 'addFloor', id: 'cellar', name: 'Porão', map: cellar() });
    state = run(state, { type: 'switchFloor', id: 'cellar' });

    expect(state.floorName).toBe('Porão');
    expect(state.tokens).toEqual([]);
    expect(state.floors?.find((floor) => floor.id === 'floor-1')?.tokens[0].creatureId).toBe(
      'hero',
    );
  });

  it('portal leva o grupo e mantém inimigos no andar de origem', () => {
    const hero = newCreature('pc', { id: 'hero', name: 'Heroína' });
    const foe = newCreature('monster', { id: 'foe', name: 'Sentinela' });
    let state = newEncounter(ground());
    state = run(state, { type: 'addCreature', creature: hero, pos: { x: 1, y: 1 } });
    state = run(state, { type: 'addCreature', creature: foe, pos: { x: 3, y: 1 } });
    state = run(state, { type: 'addFloor', id: 'cellar', name: 'Porão', map: cellar() });
    state = run(state, {
      type: 'upsertPortal',
      portal: {
        id: 'stairs',
        name: 'Escada para o porão',
        pos: { x: 2, y: 1 },
        targetFloorId: 'cellar',
        target: { x: 2, y: 1 },
      },
    });
    state = run(state, { type: 'travelPortal', id: 'stairs' });

    expect(state.floorId).toBe('cellar');
    expect(state.tokens.map((token) => token.creatureId)).toEqual(['hero']);
    expect(state.tokens[0].pos).toEqual({ x: 2, y: 1 });
    expect(state.floors?.find((floor) => floor.id === 'floor-1')?.tokens).toEqual([
      { creatureId: 'foe', pos: { x: 3, y: 1 } },
    ]);
  });

  it('não troca de andar durante o combate', () => {
    let state = run(newEncounter(ground()), {
      type: 'addFloor',
      id: 'cellar',
      name: 'Porão',
      map: cellar(),
    });
    state = { ...state, combat: { ...state.combat, phase: 'running' } };
    expect(() => run(state, { type: 'switchFloor', id: 'cellar' })).toThrow(/Encerre o combate/);
  });

  it('não revela outros andares ao jogador', () => {
    const state = run(newEncounter(ground()), {
      type: 'addFloor',
      id: 'cellar',
      name: 'Porão',
      map: cellar(),
    });
    expect(project(state, { kind: 'player', owns: [] }).floors).toEqual([]);
  });
});
