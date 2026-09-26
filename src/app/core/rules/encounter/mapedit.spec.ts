import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { GridMap, mapFromAscii, Room, Trap } from '../../models/grid';
import { RuleError } from '../creature';
import { Command, dispatch, ForbiddenError, newEncounter, project, tokenOf } from './index';

const DM: Role = { kind: 'dm' };
const dice = (...rolls: [sides: number, value: number][]) => {
  let i = 0;
  return () => {
    const [sides, v] = rolls[i++] ?? [20, 10];
    return (v - 0.5) / sides;
  };
};
const run = (s: EncounterState, cmd: Command, rng = dice(), role: Role = DM) =>
  dispatch(s, cmd, { rng, role });

const ascii = ['.......', '.......', '.......', '.......'];
const hero = (over: Partial<Creature> = {}) =>
  newCreature('pc', {
    id: 'hero',
    name: 'Herói',
    speed: 30,
    hp: { max: 30, current: 30, temp: 0 },
    abilities: { str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 10 },
    ...over,
  });
const foe = (id = 'foe') =>
  newCreature('monster', { id, name: id, hp: { max: 20, current: 20, temp: 0 } });

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1',
  name: 'Sala dos Sarcófagos',
  description: 'Fileiras de sarcófagos de pedra.',
  notes: 'A chave está no terceiro.',
  x: 4,
  y: 0,
  w: 3,
  h: 3,
  ...over,
});
const trap = (over: Partial<Trap> = {}): Trap => ({
  id: 't1',
  name: 'Placa de pressão',
  pos: { x: 3, y: 0 },
  ability: 'dex',
  dc: 13,
  damage: '2d10',
  damageType: 'piercing',
  hidden: true,
  triggered: false,
  ...over,
});

function scene(rows = ascii) {
  const map = mapFromAscii(rows);
  // goblin na última célula de piso (varrendo do fim), longe do herói em (0,0)
  const last = map.cells
    .map((t, i) => ({ t, i }))
    .reverse()
    .find((c) => c.t === 'floor' && c.i > 0)!.i;
  const foePos = { x: last % map.width, y: Math.floor(last / map.width) };
  let s = newEncounter(map);
  s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 0, y: 0 } });
  s = run(s, { type: 'addCreature', creature: foe(), pos: foePos });
  s = run(s, { type: 'setInitiative', id: 'hero', value: 20 });
  s = run(s, { type: 'setInitiative', id: 'foe', value: 5 });
  return run(s, { type: 'startCombat' });
}

describe('pintura do mapa', () => {
  it('pinta um traço inteiro num único comando', () => {
    const s = run(newEncounter(mapFromAscii(ascii)), {
      type: 'paint',
      cells: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      terrain: 'wall',
    });
    expect(s.map.cells[1 * 7 + 1]).toBe('wall');
    expect(s.map.cells[1 * 7 + 2]).toBe('wall');
    expect(s.map.cells[0]).toBe('floor');
  });

  it('não levanta parede sobre uma criatura nem fora do mapa', () => {
    const s = scene();
    expect(() => run(s, { type: 'paint', cells: [{ x: 0, y: 0 }], terrain: 'wall' })).toThrow(
      /criatura/,
    );
    expect(() => run(s, { type: 'paint', cells: [{ x: 9, y: 0 }], terrain: 'floor' })).toThrow(
      /mapa/,
    );
  });

  it('só o Mestre edita o mapa', () => {
    const player: Role = { kind: 'player', owns: ['hero'] };
    const s = scene();
    expect(() =>
      run(s, { type: 'paint', cells: [{ x: 1, y: 1 }], terrain: 'wall' }, dice(), player),
    ).toThrow(ForbiddenError);
    expect(() => run(s, { type: 'upsertTrap', trap: trap() }, dice(), player)).toThrow(
      ForbiddenError,
    );
  });

  it('água e portas fechadas: água custa o dobro, porta fechada bloqueia', () => {
    const s = scene(['.~.d.', '#####']);
    const moved = run(s, { type: 'move', actorId: 'hero', to: { x: 2, y: 0 } });
    expect(moved.combat.turn?.movedFt).toBe(15); // água (10) + piso (5)
    expect(() =>
      run(scene(['..d..', '#####']), { type: 'move', actorId: 'hero', to: { x: 3, y: 0 } }),
    ).toThrow(/alcance/);
  });
});

describe('portas', () => {
  const doors = ['.d....', '......'];

  it('abre a porta fechada adjacente e depois passa', () => {
    let s = scene(doors);
    s = run(s, { type: 'openDoor', actorId: 'hero', pos: { x: 1, y: 0 } });
    expect(s.map.cells[1]).toBe('door');
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 2, y: 0 } });
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 2, y: 0 });
  });

  it('porta trancada não abre; longe demais não abre', () => {
    const locked = scene(['.L....', '......']);
    expect(() => run(locked, { type: 'openDoor', actorId: 'hero', pos: { x: 1, y: 0 } })).toThrow(
      /trancada/,
    );
    const far = scene(['.....d', '......']);
    expect(() => run(far, { type: 'openDoor', actorId: 'hero', pos: { x: 5, y: 0 } })).toThrow(
      /longe/,
    );
  });

  it('jogador abre a porta pela sua criatura', () => {
    const player: Role = { kind: 'player', owns: ['hero'] };
    const s = run(
      scene(doors),
      { type: 'openDoor', actorId: 'hero', pos: { x: 1, y: 0 } },
      dice(),
      player,
    );
    expect(s.map.cells[1]).toBe('door');
  });
});

describe('armadilhas', () => {
  const armed = () => run(scene(), { type: 'upsertTrap', trap: trap() });

  it('para o movimento na armadilha e a dispara (falhou: dano inteiro)', () => {
    // salvaguarda d20 4 (+1 Des) = 5 < 13; dano 2d10 = 5 + 6 = 11
    const s = run(
      armed(),
      { type: 'move', actorId: 'hero', to: { x: 6, y: 0 } },
      dice([20, 4], [10, 5], [10, 6]),
    );
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 3, y: 0 }); // parou na placa
    expect(s.combat.turn?.movedFt).toBe(15);
    expect(s.creatures.find((c) => c.id === 'hero')?.hp.current).toBe(30 - 11);
    const t = s.map.traps![0];
    expect(t).toMatchObject({ triggered: true, hidden: false });
    expect(s.log.at(-1)?.text).toContain('Placa de pressão');
  });

  it('passar na salvaguarda causa metade', () => {
    const s = run(
      armed(),
      { type: 'move', actorId: 'hero', to: { x: 6, y: 0 } },
      dice([20, 18], [10, 5], [10, 6]),
    );
    expect(s.creatures.find((c) => c.id === 'hero')?.hp.current).toBe(30 - 5); // 11 / 2
  });

  it('só dispara uma vez', () => {
    let s = run(
      armed(),
      { type: 'move', actorId: 'hero', to: { x: 6, y: 0 } },
      dice([20, 4], [10, 1], [10, 1]),
    );
    const hp = s.creatures.find((c) => c.id === 'hero')!.hp.current;
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 6, y: 0 } });
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 6, y: 0 });
    expect(s.creatures.find((c) => c.id === 'hero')?.hp.current).toBe(hp);
  });

  it('valida a armadilha: dado inválido, parede e fora do mapa', () => {
    const s = scene();
    expect(() => run(s, { type: 'upsertTrap', trap: trap({ damage: 'muito' }) })).toThrow(
      RuleError,
    );
    expect(() => run(s, { type: 'upsertTrap', trap: trap({ pos: { x: 99, y: 0 } }) })).toThrow(
      /mapa/,
    );
  });

  it('armadilha escondida não aparece para o jogador até disparar', () => {
    const player: Role = { kind: 'player', owns: ['hero'] };
    let s = armed();
    expect(project(s, player).map.traps).toEqual([]);
    s = run(
      s,
      { type: 'move', actorId: 'hero', to: { x: 6, y: 0 } },
      dice([20, 4], [10, 1], [10, 1]),
    );
    expect(project(s, player).map.traps).toHaveLength(1);
  });
});

describe('névoa de guerra e salas', () => {
  const withRoom = () => {
    let s = scene();
    s = run(s, { type: 'upsertRoom', room: room() });
    // tudo sob névoa
    const all = Array.from({ length: 7 * 4 }, (_, i) => ({ x: i % 7, y: Math.floor(i / 7) }));
    return run(s, { type: 'setFog', cells: all, hidden: true });
  };
  const player: Role = { kind: 'player', owns: ['hero'] };

  it('o jogador não vê o terreno sob a névoa, nem criaturas nela (exceto as suas)', () => {
    const s = withRoom();
    const view = project(s, player);
    expect(view.map.cells.every((c) => c === 'unknown')).toBe(true);
    expect(view.map.fog).toBeUndefined();
    expect(view.tokens.map((t) => t.creatureId)).toEqual(['hero']); // o goblin está na névoa
    expect(project(s, DM)).toBe(s);
  });

  it('revelar a sala mostra o terreno e as criaturas dentro dela', () => {
    let s = withRoom();
    s = run(s, { type: 'revealRoom', id: 'r1' }); // x 4–6, y 0–2 (o goblin está em (6,3): fora)
    const view = project(s, player);
    expect(view.map.cells[0 * 7 + 4]).toBe('floor');
    expect(view.map.cells[3 * 7 + 6]).toBe('unknown');
    expect(view.map.rooms).toHaveLength(1);
    expect(view.map.rooms![0].notes).toBe(''); // notas secretas nunca saem
    expect(s.log.at(-1)?.text).toContain('Fileiras de sarcófagos');
    expect(view.log.at(-1)?.text).toContain('Fileiras de sarcófagos');
  });

  it('sala oculta não é enviada ao jogador e ocultar de novo devolve a névoa', () => {
    let s = withRoom();
    expect(project(s, player).map.rooms).toEqual([]);
    s = run(s, { type: 'revealRoom', id: 'r1' });
    s = run(s, { type: 'revealRoom', id: 'r1', hidden: true });
    expect(project(s, player).map.rooms).toEqual([]);
  });

  it('a sala precisa caber no mapa', () => {
    expect(() => run(scene(), { type: 'upsertRoom', room: room({ w: 20 }) })).toThrow(/caber/);
  });

  it('remover sala', () => {
    const s = run(withRoom(), { type: 'removeRoom', id: 'r1' });
    expect(s.map.rooms).toEqual([]);
  });
});

describe('trocar o mapa', () => {
  const other = (): GridMap => mapFromAscii(['..#..', '.....']);

  it('mantém quem ainda cabe e tira quem ficaria numa parede', () => {
    let s = newEncounter(mapFromAscii(ascii));
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 2, y: 0 } });
    s = run(s, { type: 'addCreature', creature: foe(), pos: { x: 4, y: 1 } });
    s = run(s, { type: 'setMap', map: other() });
    expect(tokenOf(s, 'hero')).toBeUndefined(); // (2,0) agora é parede
    expect(tokenOf(s, 'foe')?.pos).toEqual({ x: 4, y: 1 });
    expect(s.log.at(-1)?.text).toContain('1 criatura');
  });

  it('não troca no meio do combate e recusa mapa inválido', () => {
    expect(() => run(scene(), { type: 'setMap', map: other() })).toThrow(/combate/);
    const bad = { ...other(), cells: [] };
    expect(() => run(newEncounter(mapFromAscii(ascii)), { type: 'setMap', map: bad })).toThrow(
      /inválido/,
    );
  });
});
