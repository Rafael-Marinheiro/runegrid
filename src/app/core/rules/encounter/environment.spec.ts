import monsterRules from '../../../../../public/data/monster-rules.json';
import monsters from '../../../../../public/data/monsters.json';
import { newCreature } from '../../models/creature-factory';
import { Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { Command, dispatch, newEncounter } from '../encounter';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import { monsterToCreature } from '../srd/convert';
import { inRunningWater, isSunlit, sunPenalty } from './environment';

const dm: Role = { kind: 'dm' };
const rng = () => 0.5;
const sheets = monsters as unknown as SrdMonster[];
const sheet = (id: string) => sheets.find((m) => m.id === id)!;

beforeAll(() =>
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities('2014', monsterRules as unknown as MonsterRules, sheets),
  ),
);

const rows = ['..........', '..........', '..~~~~....', '..........', '..........'];

function scene(id: string, env: { sunlight?: boolean; runningWater?: boolean } = {}, room = false) {
  let s = newEncounter(mapFromAscii(rows));
  const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
  if (room)
    s = {
      ...s,
      map: {
        ...s.map,
        rooms: [{ id: 'r', name: 'Sala', description: '', notes: '', x: 0, y: 0, w: 4, h: 5 }],
      },
    };
  run({ type: 'setEnvironment', ...env });
  run({
    type: 'addCreature',
    creature: { ...monsterToCreature(sheet(id)), id: 'mon' },
    pos: { x: 1, y: 1 },
  });
  run({ type: 'setInitiative', id: 'mon', value: 20 });
  run({
    type: 'addCreature',
    creature: newCreature('pc', { id: 'pc', name: 'Herói', hp: { max: 90, current: 90, temp: 0 } }),
    pos: { x: 8, y: 1 },
  });
  run({ type: 'setInitiative', id: 'pc', value: 5 });
  run({ type: 'startCombat' });
  return { get: () => s, run };
}

const mon = (t: ReturnType<typeof scene>) => t.get().creatures.find((c) => c.id === 'mon')!;

describe('luz do sol e água corrente', () => {
  it('o vampiro sofre 20 radiante ao começar o turno ao sol e não regenera; numa sala não', () => {
    const sun = scene('vampire', { sunlight: true });
    expect(isSunlit(sun.get(), mon(sun))).toBe(true);
    expect(mon(sun).hp.current).toBe(sheet('vampire').hp - 20);
    const room = scene('vampire', { sunlight: true }, true);
    expect(isSunlit(room.get(), mon(room))).toBe(false);
    expect(mon(room).hp.current).toBe(sheet('vampire').hp);
  });

  it('água corrente: 20 de ácido ao terminar o turno nela', () => {
    const t = scene('vampire', { runningWater: true });
    t.run({ type: 'placeToken', id: 'mon', pos: { x: 3, y: 2 } });
    expect(inRunningWater(t.get(), mon(t))).toBe(true);
    const hp = mon(t).hp.current;
    t.run({ type: 'endTurn', actorId: 'mon' });
    expect(mon(t).hp.current).toBe(hp - 20);
    // água parada não machuca
    const still = scene('vampire', { runningWater: false });
    still.run({ type: 'placeToken', id: 'mon', pos: { x: 3, y: 2 } });
    const hp2 = mon(still).hp.current;
    still.run({ type: 'endTurn', actorId: 'mon' });
    expect(mon(still).hp.current).toBe(hp2);
  });

  it('não muda de forma ao sol; à sombra muda', () => {
    const sun = scene('vampire', { sunlight: true });
    const shift = abilitiesOf(mon(sun)).find((a) => a.nameEn === 'Shapechanger')!;
    expect(() =>
      sun.run({ type: 'cast', actorId: 'mon', spellId: shift.id, option: 'bat', ruleset: '2014' }),
    ).toThrow(/luz do sol/);
    const shade = scene('vampire', { sunlight: false });
    const sh = abilitiesOf(mon(shade)).find((a) => a.nameEn === 'Shapechanger')!;
    shade.run({ type: 'cast', actorId: 'mon', spellId: sh.id, option: 'bat', ruleset: '2014' });
    expect(mon(shade).form?.id).toBe('bat');
  });

  it('Fuga Nebulosa: a 0 PV vira névoa em vez de morrer; só volta com PV; ao sol morre', () => {
    const t = scene('vampire');
    t.run({ type: 'damage', targetId: 'mon', amount: 500 });
    expect(mon(t).status).toBe('alive');
    expect(mon(t).hp.current).toBe(0);
    expect(mon(t).form).toMatchObject({ id: 'mist', noRevert: true });
    t.run({ type: 'heal', targetId: 'mon', amount: 1 });
    expect(mon(t).form).toBeUndefined();
    expect(mon(t).hp.current).toBe(1);
    const sun = scene('vampire', { sunlight: true });
    sun.run({ type: 'damage', targetId: 'mon', amount: 500 });
    expect(mon(sun).status).toBe('dead');
  });

  it('Sensibilidade à Luz Solar: desvantagem nos ataques ao sol', () => {
    const sun = scene('kobold', { sunlight: true });
    const shade = scene('kobold', { sunlight: false });
    expect(sunPenalty(sun.get(), mon(sun))).toBe(true);
    expect(sunPenalty(shade.get(), mon(shade))).toBe(false);
  });

  it('Estaca no Coração: só vale em quem está incapacitado; paralisa o vampiro e destrói a cria', () => {
    const t = scene('vampire');
    expect(() => t.run({ type: 'stake', targetId: 'mon' })).toThrow(/incapacitado/);
    t.run({ type: 'addCondition', targetId: 'mon', condition: 'incapacitated' });
    t.run({ type: 'stake', targetId: 'mon' });
    expect(mon(t).conditions.map((c) => c.name)).toContain('paralyzed');
    t.run({ type: 'stake', targetId: 'mon', remove: true });
    expect(mon(t).conditions.map((c) => c.name)).not.toContain('paralyzed');
    const spawn = scene('vampire-spawn');
    spawn.run({ type: 'addCondition', targetId: 'mon', condition: 'incapacitated' });
    spawn.run({ type: 'stake', targetId: 'mon' });
    expect(mon(spawn).status).toBe('dead');
    expect(() => scene('wolf').run({ type: 'stake', targetId: 'mon' })).toThrow(/estaca/);
  });

  it('Proibição: o vampiro não entra numa moradia sem convite', () => {
    const t = scene('vampire', {}, true);
    t.run({ type: 'setResidence', id: 'r', residence: true });
    expect(() => t.run({ type: 'move', actorId: 'mon', to: { x: 2, y: 3 } })).toThrow(/convite/);
    t.run({ type: 'setResidence', id: 'r', invite: 'mon' });
    expect(() => t.run({ type: 'move', actorId: 'mon', to: { x: 2, y: 3 } })).not.toThrow();
  });
});
