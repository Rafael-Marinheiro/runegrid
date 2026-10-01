import monsterRules24 from '../../../../../public/data/monster-rules-2024.json';
import monsterRules14 from '../../../../../public/data/monster-rules.json';
import monsters14 from '../../../../../public/data/monsters.json';
import monsters24 from '../../../../../public/data/monsters-2024.json';
import { newCreature } from '../../models/creature-factory';
import { Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { Command, dispatch, newEncounter } from '../encounter';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import { monsterToCreature } from '../srd/convert';
import { splitOnDamage } from './summon';
import { refresh as refreshGear } from '../inventory/inventory';

const dm: Role = { kind: 'dm' };
const sheets = monsters24 as unknown as SrdMonster[];
const old = monsters14 as unknown as SrdMonster[];
const OLD = new Set([
  'aboleth',
  'green-hag',
  'bulette',
  '14:stone-giant',
  '14:rust-monster',
  'androsphinx',
]);
const mon = (id: string, as: string) => ({
  ...monsterToCreature(
    OLD.has(id)
      ? old.find((m) => m.id === id.replace('14:', ''))!
      : sheets.find((m) => m.id === `srd-2024_${id}`)!,
  ),
  id: as,
});

beforeAll(() => {
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities('2014', monsterRules14 as unknown as MonsterRules),
  );
  registerMonsterAbilities(
    '2024',
    buildMonsterAbilities('2024', monsterRules24 as unknown as MonsterRules, sheets),
  );
});

/** O herói (iniciativa 20) ataca `foes`, posicionados em linha na linha 2. */
function scene(
  foes: [ReturnType<typeof mon>, number][],
  bonus: number,
  range = 5,
  rng: () => number = () => 0.5,
  dmgType: 'slashing' | 'bludgeoning' = 'slashing',
  pcExtra: Partial<ReturnType<typeof newCreature>> = {},
) {
  let s = newEncounter(mapFromAscii(Array.from({ length: 5 }, () => '..........')));
  const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
  run({
    type: 'addCreature',
    creature: newCreature('pc', {
      id: 'pc',
      name: 'Herói',
      hp: { max: 90, current: 90, temp: 0 },
      attacks: [{ name: 'Golpe', bonus, damage: '2d6', type: dmgType, range }],
      ...pcExtra,
    }),
    pos: { x: 0, y: 2 },
  });
  run({ type: 'setInitiative', id: 'pc', value: 20 });
  foes.forEach(([c, x], i) => {
    run({ type: 'addCreature', creature: c, pos: { x, y: 2 } });
    run({ type: 'setInitiative', id: c.id, value: 5 - i });
  });
  run({ type: 'startCombat' });
  return { get: () => s, run, patch: (f: (x: typeof s) => typeof s) => (s = f(s)) };
}

describe('reações em favor de outros', () => {
  it('o Guardião Escudo dá +5 de CA ao aliado golpeado e o golpe erra', () => {
    const t = scene(
      [
        [mon('goblin-warrior', 'gob'), 1],
        [mon('shield-guardian', 'guard'), 2],
      ],
      7,
    );
    const ac = t.get().creatures.find((c) => c.id === 'gob')!.ac;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'gob', attackIndex: 0 });
    // total 11 + 7 = 18: acerta CA 15, mas o guardião pode somar +5
    expect(ac).toBeLessThan(18);
    const pend = t.get().combat.pending ?? [];
    expect(pend.map((p) => p.reactorId)).toEqual(['guard']);
    const spell = abilitiesOf(t.get().creatures.find((c) => c.id === 'guard')!).find(
      (a) => a.nameEn === 'Protection',
    )!;
    const hp = t.get().creatures.find((c) => c.id === 'gob')!.hp.current;
    t.run({
      type: 'reaction',
      actorId: 'guard',
      use: true,
      spellId: spell.id,
      ruleset: '2024',
    });
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBe(hp);
    expect(t.get().combat.pending).toEqual([]);
    expect(t.get().combat.reactionUsed).toContain('guard');
  });

  it('recusar a reação deixa o dano correr', () => {
    const t = scene(
      [
        [mon('goblin-warrior', 'gob'), 1],
        [mon('shield-guardian', 'guard'), 2],
      ],
      7,
    );
    const hp = t.get().creatures.find((c) => c.id === 'gob')!.hp.current;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'gob', attackIndex: 0 });
    t.run({ type: 'reaction', actorId: 'guard', use: false });
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBeLessThan(hp);
  });

  it('Redirecionar Ataque: o chefe troca de lugar com o aliado, que passa a ser o alvo', () => {
    const t = scene(
      [
        [mon('goblin-boss', 'boss'), 1],
        [mon('goblin-warrior', 'gob'), 2],
      ],
      20,
    );
    const hpBoss = t.get().creatures.find((c) => c.id === 'boss')!.hp.current;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'boss', attackIndex: 0 });
    const redirect = abilitiesOf(t.get().creatures.find((c) => c.id === 'boss')!).find(
      (a) => a.nameEn === 'Redirect Attack',
    )!;
    expect(() =>
      t.run({
        type: 'reaction',
        actorId: 'boss',
        use: true,
        spellId: redirect.id,
        ruleset: '2024',
      }),
    ).toThrow();
    t.run({
      type: 'reaction',
      actorId: 'boss',
      use: true,
      spellId: redirect.id,
      targetId: 'gob',
      ruleset: '2024',
    });
    const pos = (id: string) => t.get().tokens.find((k) => k.creatureId === id)!.pos;
    expect(pos('boss').x).toBe(2);
    expect(pos('gob').x).toBe(1);
    expect(t.get().creatures.find((c) => c.id === 'boss')!.hp.current).toBe(hpBoss);
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBeLessThan(
      mon('goblin-warrior', 'x').hp.max,
    );
  });

  it('Desviar Projétil só responde a ataques à distância e reduz o dano', () => {
    const melee = scene([[mon('stone-giant', 'giant'), 1]], 20);
    melee.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    expect(melee.get().combat.pending).toEqual([]);
    const ranged = scene([[mon('stone-giant', 'giant'), 3]], 20, 60);
    ranged.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    expect(ranged.get().combat.pending?.length).toBe(1);
    const spell = abilitiesOf(ranged.get().creatures.find((c) => c.id === 'giant')!).find(
      (a) => a.nameEn === 'Deflect Missile',
    )!;
    const hp = ranged.get().creatures.find((c) => c.id === 'giant')!.hp.current;
    ranged.run({
      type: 'reaction',
      actorId: 'giant',
      use: true,
      spellId: spell.id,
      ruleset: '2024',
    });
    // 2d6 (7) é menos que 1d10+6: o gigante não sofre nada
    expect(ranged.get().creatures.find((c) => c.id === 'giant')!.hp.current).toBe(hp);
  });
});

describe('testes e perseguição', () => {
  it('Detectar rola Percepção e revela quem se escondia mal', () => {
    const t = scene([[mon('aboleth', 'abo'), 4]], 5);
    t.patch((x) => ({
      ...x,
      tokens: x.tokens.map((k) => (k.creatureId === 'pc' ? { ...k, hidden: true } : k)),
    }));
    const detect = abilitiesOf(t.get().creatures.find((c) => c.id === 'abo')!).find(
      (a) => a.nameEn === 'Detect',
    )!;
    expect(detect.check).toEqual({ skill: 'perception' });
    t.run({ type: 'cast', actorId: 'abo', spellId: detect.id, ruleset: '2014' });
    expect(t.get().log.some((e) => /Percepção|perception/i.test(e.text))).toBe(true);
    expect(t.get().tokens.find((k) => k.creatureId === 'pc')!.hidden).toBeFalsy();
  });

  it('Perseguição: quem termina o movimento à vista é seguido, para até 3 m dele', () => {
    const t = scene([[mon('nalfeshnee', 'nal'), 8]], 5);
    t.run({ type: 'move', actorId: 'pc', to: { x: 3, y: 2 } });
    expect(t.get().combat.pending?.map((p) => p.reactorId)).toEqual(['nal']);
    const p = abilitiesOf(t.get().creatures.find((c) => c.id === 'nal')!).find(
      (a) => a.nameEn === 'Pursuit',
    )!;
    t.run({ type: 'reaction', actorId: 'nal', use: true, spellId: p.id, ruleset: '2024' });
    const pos = t.get().tokens.find((k) => k.creatureId === 'nal')!.pos;
    expect(Math.max(Math.abs(pos.x - 3), Math.abs(pos.y - 2))).toBeLessThanOrEqual(2);
    expect(t.get().combat.reactionUsed).toContain('nal');
  });

  it('Tinta do Polvo 2024: ao fim do turno de quem está perto, e só uma vez por consulta', () => {
    const t = scene([[mon('octopus', 'oct'), 1]], 5);
    t.run({ type: 'endTurn', actorId: 'pc' });
    expect(t.get().combat.pending?.map((p) => p.reactorId)).toEqual(['oct']);
    t.run({ type: 'reaction', actorId: 'oct', use: false });
    t.run({ type: 'endTurn', actorId: 'pc' });
    expect(t.get().combat.pending).toEqual([]);
  });

  it('Desviar Projétil devolve a força quando o dano chega a 0', () => {
    const t = scene([[mon('stone-giant', 'giant'), 3]], 20, 60);
    t.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    const spell = abilitiesOf(t.get().creatures.find((c) => c.id === 'giant')!).find(
      (a) => a.nameEn === 'Deflect Missile',
    )!;
    t.run({ type: 'reaction', actorId: 'giant', use: true, spellId: spell.id, ruleset: '2024' });
    expect(t.get().creatures.find((c) => c.id === 'pc')!.hp.current).toBeLessThan(90);
  });
});

describe('habilidades que antes ficavam com o Mestre', () => {
  it('Apressar do golem de argila: Correr e Desengajar sem gastar outra ação', () => {
    const t = scene([[mon('clay-golem', 'golem'), 6]], 5);
    t.run({ type: 'endTurn', actorId: 'pc' });
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'golem')!).find(
      (a) => a.nameEn === 'Hasten',
    )!;
    t.run({ type: 'cast', actorId: 'golem', spellId: ab.id, ruleset: '2024' });
    expect(t.get().combat.turn).toMatchObject({ dashed: true, disengaged: true });
  });

  const gear = (ref: string, id = 'g1') => ({
    inventory: [{ id, ref, qty: 1, equipped: true }],
  });

  it('Antenas: a armadura de metal enferruja a cada toque e é destruída ao chegar a CA 10', () => {
    const t = scene([[mon('rust-monster', 'rust'), 1]], 5, 5, () => 0.1, 'slashing', {
      ...gear('chain-mail'),
      ac: 16,
    });
    t.run({ type: 'endTurn', actorId: 'pc' });
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'rust')!).find(
      (a) => a.nameEn === 'Antennae',
    )!;
    const zap = () => {
      t.run({
        type: 'cast',
        actorId: 'rust',
        spellId: ab.id,
        option: 'armor',
        targetId: 'pc',
        ruleset: '2024',
      });
      // devolve o turno ao monstro (uma ação por turno)
      t.run({ type: 'endTurn', actorId: 'rust' });
      t.run({ type: 'endTurn', actorId: 'pc' });
    };
    zap();
    const pc = () => t.get().creatures.find((c) => c.id === 'pc')!;
    expect(pc().ac).toBe(15);
    expect(pc().inventory?.[0].corrosion?.n).toBe(1);
    for (let i = 0; i < 4; i++) zap();
    expect(pc().ac).toBe(11);
    zap(); // CA 10: a armadura é destruída
    expect(pc().inventory).toHaveLength(0);
  });

  it('Antenas 2014 na arma: −1 cumulativo no dano; a arma some em −5', () => {
    const t = scene([[mon('14:rust-monster', 'rust'), 1]], 5, 5, () => 0.1, 'slashing', {
      ...gear('longsword'),
      attacks: [],
    });
    const run = t.run;
    run({ type: 'endTurn', actorId: 'pc' });
    // reaplica o equipamento para criar o ataque da arma
    t.patch((x) => ({
      ...x,
      creatures: x.creatures.map((c) => (c.id === 'pc' ? refreshGear(c) : c)),
    }));
    expect(
      t
        .get()
        .creatures.find((c) => c.id === 'pc')!
        .attacks.some((a) => a.name === 'Espada longa'),
    ).toBe(true);
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'rust')!).find(
      (a) => a.nameEn === 'Antennae',
    )!;
    run({
      type: 'cast',
      actorId: 'rust',
      spellId: ab.id,
      option: 'weapon',
      targetId: 'pc',
      ruleset: '2014',
    });
    const sword = t
      .get()
      .creatures.find((c) => c.id === 'pc')!
      .attacks.find((a) => a.name === 'Espada longa')!;
    expect(sword.damage).toMatch(/-1$/);
  });

  it('Ferrugem do Metal: a arma de metal que acerta o monstro perde 1 de dano; arma mágica não', () => {
    const t = scene([[mon('14:rust-monster', 'rust'), 1]], 20, 5, () => 0.9, 'slashing', {
      ...gear('longsword'),
      attacks: [],
    });
    t.patch((x) => ({
      ...x,
      creatures: x.creatures.map((c) => (c.id === 'pc' ? refreshGear(c) : c)),
    }));
    t.run({ type: 'attack', actorId: 'pc', targetId: 'rust', attackIndex: 0 });
    const sword = () => t.get().creatures.find((c) => c.id === 'pc')!.inventory![0].corrosion?.n;
    expect(sword()).toBe(1);
  });

  it('Destruir Metal: destrói o objeto de metal do mapa ao alcance', () => {
    const t = scene([[mon('rust-monster', 'rust'), 3]], 5);
    t.patch((x) => ({
      ...x,
      map: {
        ...x.map,
        objects: [
          {
            id: 'bars',
            kind: (x.map.objects?.[0]?.kind ?? 'chest') as never,
            pos: { x: 4, y: 2 },
            rotation: 0,
            texture: 'metal',
            blocksMovement: true,
            blocksSight: false,
          },
        ],
      },
    }));
    t.run({ type: 'endTurn', actorId: 'pc' });
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'rust')!).find(
      (a) => a.nameEn === 'Destroy Metal',
    )!;
    t.run({
      type: 'cast',
      actorId: 'rust',
      spellId: ab.id,
      point: { x: 4, y: 2 },
      ruleset: '2024',
    });
    expect(t.get().map.objects ?? []).toHaveLength(0);
  });

  it('Gosma e Pudim Negro 2024 também se dividem ao ficar Feridos', () => {
    const t = scene([[mon('black-pudding', 'pud'), 3]], 5);
    const hurt = {
      ...t.get(),
      creatures: t.get().creatures.map((c) =>
        c.id === 'pud'
          ? {
              ...c,
              hp: { ...c.hp, current: Math.floor(c.hp.max / 2) - 2 },
              lastHit: { type: 'fire' as const },
            }
          : c,
      ),
    };
    const out = splitOnDamage(hurt, 'pud', 20);
    expect(out.creatures.filter((c) => c.srdId?.endsWith('black-pudding'))).toHaveLength(2);
  });

  it('Aparência Ilusória: usar de novo encerra a ilusão', () => {
    const t = scene([[mon('green-hag', 'hag'), 6]], 5);
    t.run({ type: 'endTurn', actorId: 'pc' });
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'hag')!).find(
      (a) => a.nameEn === 'Illusory Appearance',
    )!;
    const cast = () => t.run({ type: 'cast', actorId: 'hag', spellId: ab.id, ruleset: '2014' });
    cast();
    expect(t.get().creatures.find((c) => c.id === 'hag')!.effects?.length).toBe(1);
    t.run({ type: 'endTurn', actorId: 'hag' });
    t.run({ type: 'endTurn', actorId: 'pc' });
    cast();
    expect(t.get().creatures.find((c) => c.id === 'hag')!.effects?.length ?? 0).toBe(0);
  });

  it('Olhar Inquietante: no início do turno de quem chega perto o diabo pode reagir', () => {
    const t = scene([[mon('chain-devil', 'dev'), 3]], 5);
    // o turno do herói já começou ao iniciar o combate
    expect(t.get().combat.pending?.map((p) => p.reactorId)).toEqual(['dev']);
  });
});

describe('últimas habilidades de monstros', () => {
  it('Salto Mortal do bulette: salta e atinge quem fica ao lado do pouso', () => {
    const t = scene([[mon('bulette', 'bul'), 6]], 5);
    t.run({ type: 'endTurn', actorId: 'pc' });
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'bul')!).find(
      (a) => a.nameEn === 'Deadly Leap',
    )!;
    const hp = t.get().creatures.find((c) => c.id === 'pc')!.hp.current;
    t.run({ type: 'cast', actorId: 'bul', spellId: ab.id, point: { x: 1, y: 2 }, ruleset: '2014' });
    const pc = t.get().creatures.find((c) => c.id === 'pc')!;
    expect(pc.hp.current).toBeLessThan(hp);
    expect(pc.conditions.some((k) => k.name === 'prone')).toBe(true);
  });

  it('Pegar Pedra: o gigante pega o projétil contundente e não sofre dano', () => {
    const t = scene([[mon('14:stone-giant', 'giant'), 3]], 20, 60, () => 0.5, 'bludgeoning');
    const hp = t.get().creatures.find((c) => c.id === 'giant')!.hp.current;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    const spell = abilitiesOf(t.get().creatures.find((c) => c.id === 'giant')!).find(
      (a) => a.nameEn === 'Rock Catching',
    )!;
    t.run({ type: 'reaction', actorId: 'giant', use: true, spellId: spell.id, ruleset: '2014' });
    expect(t.get().creatures.find((c) => c.id === 'giant')!.hp.current).toBe(hp);
  });

  it('Peso dos Anos: a exaustão se acumula (−2 nos ataques e salvaguardas por nível)', () => {
    const t = scene([[mon('sphinx-of-lore', 'sph'), 4]], 5);
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'sph')!).find(
      (a) => a.nameEn === 'Weight of Years',
    )!;
    const zap = () =>
      t.run({ type: 'cast', actorId: 'sph', spellId: ab.id, targetId: 'pc', ruleset: '2024' });
    zap();
    zap();
    const eff = t.get().creatures.find((c) => c.id === 'pc')!.effects ?? [];
    expect(eff).toHaveLength(1);
    expect(eff[0].mods).toMatchObject({ attackBonus: -4, save: -4, speed: -10 });
  });

  it('Olhar Inquietante: quem passa na salvaguarda fica imune ao olhar', () => {
    const t = scene([[mon('chain-devil', 'dev'), 3]], 5, 5, () => 0.99);
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'dev')!).find(
      (a) => a.nameEn === 'Unnerving Gaze',
    )!;
    t.run({ type: 'reaction', actorId: 'dev', use: true, spellId: ab.id, ruleset: '2024' });
    const pc = t.get().creatures.find((c) => c.id === 'pc')!;
    expect(pc.effects?.some((e) => e.id.endsWith(':immune'))).toBe(true);
  });

  it('Lançar Magia das esfinges é cobrado nas ações lendárias, não conjurado direto', () => {
    const t = scene([[mon('androsphinx', 'sph'), 4]], 5);
    const ab = abilitiesOf(t.get().creatures.find((c) => c.id === 'sph')!).find(
      (a) => a.nameEn === 'Cast a Spell',
    )!;
    expect(ab.ability?.legendaryCast).toBe('spell');
    expect(() => t.run({ type: 'cast', actorId: 'sph', spellId: ab.id, ruleset: '2014' })).toThrow(
      /lista|list/i,
    );
  });
});
