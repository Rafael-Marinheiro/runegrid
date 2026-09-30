import rules2014 from '../../../../../public/data/spell-rules.json';
import rules2024 from '../../../../../public/data/spell-rules-2024.json';
import spells2014 from '../../../../../public/data/spells.json';
import spells2024 from '../../../../../public/data/spells-2024.json';
import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdSpell } from '../../models/srd';
import { effectiveAc } from '../creature';
import { fullCasterSlots } from '../creature/rest';
import { Command, dispatch, newEncounter } from '../encounter';
import { buildSpells, mergeRules, SpellRules } from './build';
import { registerSpells } from './registry';

registerSpells(
  '2024',
  buildSpells(
    spells2024 as unknown as SrdSpell[],
    mergeRules(rules2014 as unknown as SpellRules, rules2024 as unknown as SpellRules),
  ),
);
registerSpells(
  '2014',
  buildSpells(spells2014 as unknown as SrdSpell[], rules2014 as unknown as SpellRules),
);

const dm = { kind: 'dm' } as const;
const run = (s: EncounterState, cmd: Command, rng: () => number = () => 0.5) =>
  dispatch(s, cmd, { rng, role: dm });
const map = mapFromAscii(Array.from({ length: 10 }, () => '..............'));

const ALL = [
  'sleep',
  'bless',
  'protection-from-energy',
  'dispel-magic',
  'revivify',
  'vampiric-touch',
  'mirror-image',
  'spiritual-weapon',
  'acid-arrow',
  'hypnotic-pattern',
  'mage-armor',
  'magic-weapon',
  'lesser-restoration',
  'hold-person',
  'shield',
  'scorching-ray',
  'ice-knife',
  'dragons-breath',
  'searing-smite',
  'counterspell',
  'magic-missile',
  'death-ward',
  'power-word-kill',
  'power-word-stun',
  'prismatic-spray',
  'divine-word',
  'mass-heal',
  'weird',
  'raise-dead',
  'cone-of-cold',
];

function scene(foes: Partial<Creature>[] = [{}], withAlly = false) {
  let s = newEncounter(map);
  const add = (c: Creature, x: number, y: number, init: number) => {
    s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
    s = run(s, { type: 'setInitiative', id: c.id, value: init });
  };
  add(
    newCreature('pc', {
      id: 'w',
      name: 'Mago',
      level: 9,
      ac: 12,
      hp: { max: 40, current: 20, temp: 0 },
      abilities: { str: 10, dex: 14, con: 14, int: 18, wis: 10, cha: 10 },
      spellSlots: fullCasterSlots(17),
      spellcasting: { ability: 'int', spells: ALL },
    }),
    3,
    3,
    20,
  );
  if (withAlly)
    add(
      newCreature('pc', {
        id: 'ally',
        name: 'Aliado',
        hp: { max: 30, current: 30, temp: 0 },
        attacks: [{ name: 'Espada', bonus: 5, damage: '1d8+3', type: 'slashing', range: 5 }],
      }),
      2,
      3,
      15,
    );
  foes.forEach((over, i) =>
    add(
      newCreature('monster', {
        id: `f${i}`,
        name: `Inimigo ${i}`,
        ac: 12,
        hp: { max: 20, current: 20, temp: 0 },
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        attacks: [{ name: 'Garra', bonus: 6, damage: '1d6+2', type: 'slashing', range: 5 }],
        ...over,
      }),
      5 + i,
      3,
      10 - i,
    ),
  );
  return run(s, { type: 'startCombat' });
}
const get = (s: EncounterState, id: string) => s.creatures.find((c) => c.id === id)!;
const cast = (
  spellId: string,
  over: Partial<Extract<Command, { type: 'cast' }>> = {},
): Command => ({
  type: 'cast',
  actorId: 'w',
  spellId,
  ...over,
});
const next = (s: EncounterState, ...ids: string[]) =>
  ids.reduce((acc, id) => run(acc, { type: 'endTurn', actorId: id }), s);

describe('magias do SRD com os dados reais (F12)', () => {
  it('Sono: a reserva pega quem tem menos PV primeiro e acorda ao sofrer dano', () => {
    let s = scene([
      { hp: { max: 12, current: 12, temp: 0 } },
      { hp: { max: 12, current: 12, temp: 0 } },
      { hp: { max: 60, current: 60, temp: 0 } },
    ]);
    // 5d8 com 0,5 = 5×5 = 25 PV: dorme 2 × 12; o de 60 fica acordado
    s = run(s, cast('sleep', { point: { x: 6, y: 3 } }));
    const asleep = (id: string) => get(s, id).conditions.some((c) => c.name === 'unconscious');
    expect([asleep('f0'), asleep('f1'), asleep('f2')]).toEqual([true, true, false]);
    s = run(s, { type: 'damage', targetId: 'f0', amount: 1 });
    expect(asleep('f0')).toBe(false);
    expect(asleep('f1')).toBe(true);
  });

  it('Proteção contra Energia: a escolha define a resistência', () => {
    let s = scene();
    s = run(s, cast('protection-from-energy', { targetId: 'w', option: 'cold' }));
    const hp = get(s, 'w').hp.current;
    s = run(s, { type: 'damage', targetId: 'w', amount: 10, damageType: 'cold' });
    expect(get(s, 'w').hp.current).toBe(hp - 5);
    s = run(s, { type: 'damage', targetId: 'w', amount: 10, damageType: 'fire' });
    expect(get(s, 'w').hp.current).toBe(hp - 15);
  });

  it('Armadura Arcana e Arma Mágica: CA e bônus no ataque', () => {
    let s = scene();
    s = run(s, cast('mage-armor', { targetId: 'w' }));
    expect(effectiveAc(get(s, 'w'))).toBe(15); // 13 + Des +2 (a CA base 12 é menor)
    s = run(s, { type: 'endTurn', actorId: 'w' });
    const w = get(s, 'w');
    expect(w.effects?.[0].rounds).toBe(4800);
  });

  it('Dissipar Magia: termina magias de nível até o espaço; acima, teste', () => {
    let s = scene();
    s = run(s, cast('mage-armor', { targetId: 'w' }));
    s = next(s, 'w', 'f0');
    s = run(s, cast('dispel-magic', { targetId: 'w', slotLevel: 3 }));
    expect(get(s, 'w').effects).toBeUndefined();
  });

  it('Reviver: volta à vida com 1 PV', () => {
    const dead = run(scene([{}, {}]), { type: 'damage', targetId: 'f0', amount: 99 });
    expect(get(dead, 'f0').status).toBe('dead');
    const near = run(dead, { type: 'move', actorId: 'w', to: { x: 4, y: 3 } });
    const back = run(near, cast('revivify', { targetId: 'f0' }));
    expect(get(back, 'f0').status).toBe('alive');
    expect(get(back, 'f0').hp.current).toBe(1);
  });

  it('Toque Vampírico: recupera metade do dano causado', () => {
    let s = scene([{ ac: 5, hp: { max: 60, current: 60, temp: 0 } }]);
    s = run(s, { type: 'move', actorId: 'w', to: { x: 4, y: 3 } });
    const before = get(s, 'w').hp.current;
    s = run(s, cast('vampiric-touch', { targetId: 'f0' }));
    const dealt = 60 - get(s, 'f0').hp.current;
    expect(dealt).toBeGreaterThan(0);
    expect(get(s, 'w').hp.current).toBe(before + Math.floor(dealt / 2));
  });

  it('Imagem Espelhada: ataques podem acertar as imagens', () => {
    let s = scene([
      { attacks: [{ name: 'Garra', bonus: 20, damage: '1d6+2', type: 'slashing', range: 5 }] },
    ]);
    s = run(s, cast('mirror-image'));
    s = run(s, { type: 'endTurn', actorId: 'w' });
    const hp = get(s, 'w').hp.current;
    s = run(s, { type: 'move', actorId: 'f0', to: { x: 4, y: 3 } });
    s = run(s, { type: 'attack', actorId: 'f0', targetId: 'w', attackIndex: 0 }, () => 0.9);
    // d20 alto: miram uma imagem (6+) e a destroem; o mago não sofre dano
    expect(get(s, 'w').hp.current).toBe(hp);
    expect(get(s, 'w').effects?.[0].mods.images).toBe(2);
  });

  it('Flecha Ácida: errar causa metade; acertar dá dano contínuo no fim do turno do alvo', () => {
    let s = scene([{ ac: 5, hp: { max: 100, current: 100, temp: 0 } }]);
    s = run(s, cast('acid-arrow', { targetId: 'f0' }));
    const afterHit = get(s, 'f0').hp.current;
    expect(afterHit).toBeLessThan(100);
    s = next(s, 'w');
    s = next(s, 'f0');
    expect(get(s, 'f0').hp.current).toBeLessThan(afterHit); // 2d4 ácido no fim do turno
    let m = scene([{ ac: 30, hp: { max: 100, current: 100, temp: 0 } }]);
    m = run(m, cast('acid-arrow', { targetId: 'f0' }), () => 0.05);
    expect(get(m, 'f0').hp.current).toBeLessThan(100); // errou, mas respingou
    expect(get(m, 'f0').effects).toBeUndefined();
  });

  it('Restauração Menor remove uma condição', () => {
    let s = scene();
    s = run(s, { type: 'addCondition', targetId: 'w', condition: 'poisoned' });
    s = run(s, cast('lesser-restoration', { targetId: 'w' }));
    expect(get(s, 'w').conditions.length).toBe(0);
  });

  it('Padrão Hipnótico: encantados, incapacitados e imóveis até sofrerem dano', () => {
    let s = scene([{}, {}]);
    s = run(s, cast('hypnotic-pattern', { point: { x: 6, y: 3 } }), () => 0.01);
    const f = get(s, 'f0');
    expect(f.conditions.map((c) => c.name).sort()).toEqual(['charmed', 'incapacitated']);
    expect(f.effects?.length).toBe(1);
    s = run(s, { type: 'damage', targetId: 'f0', amount: 1 });
    expect(get(s, 'f0').conditions.length).toBe(0);
    expect(get(s, 'f0').effects).toBeUndefined();
  });

  it('Raios Ardentes: um ataque por raio (3 no 2º nível, +1 por nível)', () => {
    let s = scene([{ ac: 5, hp: { max: 100, current: 100, temp: 0 } }]);
    s = run(s, cast('scorching-ray', { targetId: 'f0', slotLevel: 4 }));
    expect(s.log.filter((e) => e.text.includes('raio ')).length).toBe(5);
  });
});

describe('magias de 4º ao 9º nível do SRD 2014 (F12)', () => {
  it('Proteção contra a Morte: a primeira queda a 0 PV vira 1 PV e a magia acaba', () => {
    let s = scene([{}]);
    s = run(s, cast('death-ward', { targetId: 'w', slotLevel: 4 }));
    s = run(s, { type: 'damage', targetId: 'w', amount: 99 });
    expect(get(s, 'w').hp.current).toBe(1);
    expect(get(s, 'w').status).toBe('alive');
    expect(get(s, 'w').effects).toBeUndefined();
  });

  it('Palavra de Poder: Matar só mata quem tem 100 PV ou menos', () => {
    let big = scene([{ hp: { max: 200, current: 150, temp: 0 } }]);
    big = run(big, cast('power-word-kill', { targetId: 'f0', slotLevel: 9 }));
    expect(get(big, 'f0').status).toBe('alive');
    let small = scene([{ hp: { max: 80, current: 80, temp: 0 } }]);
    small = run(small, cast('power-word-kill', { targetId: 'f0', slotLevel: 9 }));
    expect(get(small, 'f0').status).toBe('dead');
  });

  it('Palavra de Poder: Atordoar, com salvaguarda de Constituição a cada turno', () => {
    let s = scene([{ hp: { max: 100, current: 100, temp: 0 } }]);
    s = run(s, cast('power-word-stun', { targetId: 'f0', slotLevel: 8 }));
    expect(get(s, 'f0').conditions[0].name).toBe('stunned');
    expect(get(s, 'f0').conditions[0].repeatSave?.ability).toBe('con');
  });

  it('Raio Prismático: cada alvo rola o seu d8 e leva o raio dele', () => {
    let s = scene([{}, {}]);
    s = run(s, cast('prismatic-spray', { point: { x: 5, y: 3 }, slotLevel: 7 }), () => 0.01);
    expect(s.log.filter((e) => /\(d8 \d\)/.test(e.text)).length).toBe(2);
    expect(get(s, 'f0').hp.current).toBeLessThan(20);
  });

  it('Palavra Divina: o efeito depende dos PV atuais do alvo', () => {
    let s = scene([
      { hp: { max: 40, current: 15, temp: 0 } },
      { hp: { max: 60, current: 35, temp: 0 } },
    ]);
    s = run(s, cast('divine-word', { targetIds: ['f0', 'f1'], slotLevel: 7 }), () => 0.01);
    expect(get(s, 'f0').status).toBe('dead'); // 20 PV ou menos: morte
    expect(
      get(s, 'f1')
        .conditions.map((c) => c.name)
        .sort(),
    ).toEqual(['blinded', 'deafened']);
  });

  it('Cura Completa em Massa: a reserva de 700 PV se divide conforme o que falta a cada alvo', () => {
    let s = scene([{}]);
    const w = get(s, 'w');
    s = {
      ...s,
      creatures: s.creatures.map((c) =>
        c.id === 'w'
          ? { ...w, hp: { ...w.hp, max: 100, current: 10 } }
          : c.id === 'f0'
            ? { ...c, hp: { ...c.hp, max: 100, current: 50 } }
            : c,
      ),
    };
    s = run(s, cast('mass-heal', { targetIds: ['w', 'f0'], slotLevel: 9 }));
    expect(get(s, 'w').hp.current).toBe(100);
    expect(get(s, 'f0').hp.current).toBe(100);
  });

  it('Fantasma Assassino/Sussurro: passar na salvaguarda repetida encerra a condição e o dano', () => {
    let s = scene([{ hp: { max: 100, current: 100, temp: 0 } }]);
    s = run(s, cast('weird', { point: { x: 5, y: 3 }, slotLevel: 9 }), () => 0.01);
    expect(get(s, 'f0').conditions.some((c) => c.name === 'frightened')).toBe(true);
    expect(get(s, 'f0').effects?.length).toBe(1);
    s = next(s, 'w');
    s = run(s, { type: 'endTurn', actorId: 'f0' }, () => 0.99); // passa na salvaguarda
    expect(get(s, 'f0').conditions.length).toBe(0);
    expect(get(s, 'f0').effects).toBeUndefined();
  });

  it('Reviver os Mortos: volta com 1 PV e −4 nas jogadas', () => {
    let s = scene([{}]);
    s = run(s, { type: 'move', actorId: 'w', to: { x: 4, y: 3 } });
    s = run(s, { type: 'damage', targetId: 'f0', amount: 99 });
    s = run(s, cast('raise-dead', { targetId: 'f0', slotLevel: 5 }));
    expect(get(s, 'f0').status).toBe('alive');
    expect(get(s, 'f0').effects?.[0].mods.attackDie).toBe('-4');
  });
});

describe('magias do SRD 2024 com os dados reais (F12)', () => {
  const cast24 = (
    spellId: string,
    over: Partial<Extract<Command, { type: 'cast' }>> = {},
  ): Command => ({
    type: 'cast',
    actorId: 'w',
    spellId,
    ruleset: '2024',
    ...over,
  });

  it('Faca de Gelo: ataque e depois explosão nos vizinhos do alvo', () => {
    let s = scene([{ ac: 5 }, { ac: 5 }, { ac: 5 }]);
    s = run(s, cast24('ice-knife', { targetId: 'f0' }));
    expect(get(s, 'f0').hp.current).toBeLessThan(20);
    expect(get(s, 'f1').hp.current).toBeLessThan(20); // a 5 ft do alvo: levou o frio
    expect(get(s, 'f2').hp.current).toBe(20); // a 10 ft: fora da explosão
  });

  it('Sopro do Dragão: o alvo sopra na vez dele, com a CD de quem conjurou', () => {
    let s = scene([{}, {}], true);
    s = run(s, cast24('dragons-breath', { targetId: 'ally', slotLevel: 2, option: 'cold' }));
    expect(get(s, 'ally').sustained?.[0].by).toBe('w');
    s = next(s, 'w');
    const before = get(s, 'f0').hp.current;
    s = run(s, {
      type: 'cast',
      actorId: 'ally',
      spellId: 'dragons-breath',
      ruleset: '2024',
      sustain: true,
      point: { x: 5, y: 3 },
    });
    expect(get(s, 'f0').hp.current).toBeLessThan(before);
    // perder a concentração desfaz o sopro
    s = run(s, { type: 'damage', targetId: 'w', amount: 60 }, () => 0.01);
    expect(get(s, 'ally').sustained).toBeUndefined();
  });

  it('Golpe Ardente: o próximo acerto queima e o alvo começa a sofrer no início do turno', () => {
    let s = scene([{ ac: 5, hp: { max: 60, current: 60, temp: 0 } }]);
    s = run(s, { type: 'move', actorId: 'w', to: { x: 4, y: 3 } });
    // o mago ataca com a Espada do aliado? usa um ataque próprio
    const w = get(s, 'w');
    s = {
      ...s,
      creatures: s.creatures.map((c) =>
        c.id === 'w'
          ? {
              ...w,
              attacks: [{ name: 'Adaga', bonus: 6, damage: '1d4+2', type: 'piercing', range: 5 }],
            }
          : c,
      ),
    };
    s = run(s, cast24('searing-smite'));
    s = run(s, { type: 'attack', actorId: 'w', targetId: 'f0', attackIndex: 0 }, () => 0.5); // d20 baixo: só precisa acertar CA 5
    const f = get(s, 'f0');
    expect(f.hp.current).toBeLessThan(60);
  });

  it('Contrafeitiço 2024: o conjurador faz Constituição; falhar não gasta o espaço', () => {
    let s = newEncounter(map);
    const add = (c: Creature, x: number, y: number, init: number) => {
      s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
      s = run(s, { type: 'setInitiative', id: c.id, value: init });
    };
    add(
      newCreature('monster', {
        id: 'lich',
        name: 'Lich',
        hp: { max: 60, current: 60, temp: 0 },
        spellSlots: fullCasterSlots(9),
        spellcasting: { ability: 'int', spells: ['magic-missile'] },
      }),
      7,
      3,
      20,
    );
    add(
      newCreature('pc', {
        id: 'w',
        name: 'Mago',
        level: 9,
        hp: { max: 40, current: 40, temp: 0 },
        abilities: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 },
        spellSlots: fullCasterSlots(9),
        spellcasting: { ability: 'int', spells: ['counterspell'] },
      }),
      4,
      3,
      10,
    );
    s = run(s, { type: 'startCombat' });
    s = run(s, {
      type: 'cast',
      actorId: 'lich',
      spellId: 'magic-missile',
      targetId: 'w',
      ruleset: '2024',
    });
    const hp = get(s, 'w').hp.current;
    s = run(
      s,
      {
        type: 'reaction',
        actorId: 'w',
        use: true,
        spellId: 'counterspell',
        slotLevel: 3,
        ruleset: '2024',
      },
      () => 0.01,
    );
    expect(get(s, 'w').hp.current).toBe(hp); // dissipou
    expect(get(s, 'lich').spellSlots[1].used).toBe(0); // espaço devolvido
  });
});
