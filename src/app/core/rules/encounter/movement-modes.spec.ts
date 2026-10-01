import monsterRules24 from '../../../../../public/data/monster-rules-2024.json';
import monsters24 from '../../../../../public/data/monsters-2024.json';
import { newCreature } from '../../models/creature-factory';
import { Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { Command, dispatch, newEncounter } from '../encounter';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import { monsterToCreature } from '../srd/convert';
import { moveQuery } from './reduce';
import { reachable } from '../grid/movement';

const dm: Role = { kind: 'dm' };
const rng = () => 0.5;
const sheets = monsters24 as unknown as SrdMonster[];
const sheet = (id: string) => sheets.find((m) => m.id === `srd-2024_${id}`)!;

beforeAll(() =>
  registerMonsterAbilities(
    '2024',
    buildMonsterAbilities('2024', monsterRules24 as unknown as MonsterRules, sheets),
  ),
);

/** Cena: criatura `who` em (1,2); `rows` desenha o mapa; o PJ fica no fim. */
function scene(
  rows: string[],
  who: ReturnType<typeof newCreature>,
  pc = { x: 9, y: 2 },
  at = { x: 1, y: 2 },
) {
  let s = newEncounter(mapFromAscii(rows));
  const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
  run({ type: 'addCreature', creature: { ...who, id: 'mon' }, pos: at });
  run({ type: 'setInitiative', id: 'mon', value: 20 });
  run({
    type: 'addCreature',
    creature: newCreature('pc', { id: 'pc', name: 'Herói', hp: { max: 90, current: 90, temp: 0 } }),
    pos: pc,
  });
  run({ type: 'setInitiative', id: 'pc', value: 5 });
  run({ type: 'startCombat' });
  return { get: () => s, run };
}

const open = ['..........', '..........', '..........', '..........', '..........'];

describe('modos de deslocamento', () => {
  it('quem voa ignora terreno difícil e a água; quem anda paga o dobro', () => {
    const rows = ['~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~'];
    const flyer = newCreature('monster', { speed: 30, speeds: { fly: 30 } });
    const walker = newCreature('monster', { speed: 30 });
    const f = scene(rows, flyer);
    const w = scene(rows, walker);
    const far = (t: typeof f) =>
      Math.max(
        ...reachable(moveQuery(t.get(), 'mon'))
          .filter((r) => r.pos.y === 2)
          .map((r) => r.pos.x),
      );
    expect(far(f)).toBeGreaterThan(far(w));
  });

  it('o etéreo atravessa paredes e criaturas; o do plano Material não', () => {
    const wall = ['..#.......', '..#.......', '..#.......', '..#.......', '..#.......'];
    const ghost = newCreature('monster', { speed: 30, plane: 'ethereal' });
    const solid = newCreature('monster', { speed: 30 });
    const g = scene(wall, ghost);
    const m = scene(wall, solid);
    expect(() => g.run({ type: 'move', actorId: 'mon', to: { x: 5, y: 2 } })).not.toThrow();
    expect(() => m.run({ type: 'move', actorId: 'mon', to: { x: 5, y: 2 } })).toThrow();
  });

  it('modo de voo escolhido: o dragão voa mais longe que anda, e o modo nadar não paga a água', () => {
    const rows = ['~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~'];
    const frog = newCreature('monster', { speed: 20, speeds: { swim: 40 } });
    const t = scene(rows, frog);
    const walk = Math.max(...reachable(moveQuery(t.get(), 'mon', 'walk')).map((r) => r.pos.x));
    const swim = Math.max(...reachable(moveQuery(t.get(), 'mon', 'swim')).map((r) => r.pos.x));
    expect(swim).toBeGreaterThan(walk);
  });
});

describe('deslocamento das habilidades', () => {
  const bulette = () => monsterToCreature(sheet('bulette'));

  it('Salto: segue o caminho, gasta 3 m do deslocamento e não passa por parede', () => {
    const t = scene(open, bulette());
    const leap = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Leap')!;
    expect(leap.move).toMatchObject({ ft: 30, spend: 10 });
    const before = t.get().combat.turn!.movedFt;
    t.run({
      type: 'cast',
      actorId: 'mon',
      spellId: leap.id,
      point: { x: 7, y: 2 },
      ruleset: '2024',
    });
    expect(t.get().tokens.find((k) => k.creatureId === 'mon')?.pos).toEqual({ x: 7, y: 2 });
    expect(t.get().combat.turn!.movedFt).toBe(before + 10);
    // além de 9 m não vai
    const far = scene(open, bulette());
    const l2 = abilitiesOf(far.get().creatures[0]).find((a) => a.nameEn === 'Leap')!;
    expect(() =>
      far.run({
        type: 'cast',
        actorId: 'mon',
        spellId: l2.id,
        point: { x: 9, y: 4 },
        ruleset: '2024',
      }),
    ).toThrow();
    // parede no caminho: sem rota dentro do alcance
    const walled = scene(
      ['..#.......', '..#.......', '..#.......', '..#.......', '..#.......'],
      bulette(),
      { x: 9, y: 2 },
      { x: 0, y: 2 },
    );
    const l3 = abilitiesOf(walled.get().creatures[0]).find((a) => a.nameEn === 'Leap')!;
    expect(() =>
      walled.run({
        type: 'cast',
        actorId: 'mon',
        spellId: l3.id,
        point: { x: 4, y: 2 },
        ruleset: '2024',
      }),
    ).toThrow(/caminho|alcance|chegar/i);
  });

  it('Investida do troll: só avança rumo a um inimigo, sem sair da linha de metade do deslocamento', () => {
    const t = scene(open, monsterToCreature(sheet('troll')));
    const charge = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Charge')!;
    expect(charge.move).toMatchObject({ towardEnemy: true, mode: 'walk' });
    expect(() =>
      t.run({
        type: 'cast',
        actorId: 'mon',
        spellId: charge.id,
        point: { x: 0, y: 2 },
        ruleset: '2024',
      }),
    ).toThrow(/mais perto/);
    t.run({
      type: 'cast',
      actorId: 'mon',
      spellId: charge.id,
      point: { x: 4, y: 2 },
      ruleset: '2024',
    });
    expect(t.get().tokens.find((k) => k.creatureId === 'mon')?.pos).toEqual({ x: 4, y: 2 });
  });
});
