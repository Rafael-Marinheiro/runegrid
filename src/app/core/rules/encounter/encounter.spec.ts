import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { RuleError } from '../creature';
import { Command, dispatch, ForbiddenError, newEncounter, project, tokenOf } from './index';

const DM: Role = { kind: 'dm' };
/** RNG que devolve, em ordem, o valor de face pedido para dados de `sides` lados. */
const dice = (...rolls: [sides: number, value: number][]) => {
  let i = 0;
  return () => {
    const [sides, v] = rolls[i++] ?? [20, 10];
    return (v - 0.5) / sides;
  };
};

const map = mapFromAscii(['........', '........', '..###...', '........', '........']);

const hero = (over: Partial<Creature> = {}) =>
  newCreature('pc', {
    id: 'hero',
    name: 'Herói',
    speed: 30,
    hp: { max: 30, current: 30, temp: 0 },
    abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
    attacksPerAction: 2,
    attacks: [
      { name: 'Espada', bonus: 5, damage: '1d8+3', type: 'slashing', range: 5 },
      { name: 'Arco', bonus: 5, damage: '1d8', type: 'piercing', range: 60 },
    ],
    ...over,
  });
const foe = (over: Partial<Creature> = {}) =>
  newCreature('monster', {
    id: 'foe',
    name: 'Goblin',
    ac: 12,
    hp: { max: 20, current: 20, temp: 0 },
    abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [{ name: 'Adaga', bonus: 4, damage: '1d4+2', type: 'piercing', range: 5 }],
    ...over,
  });

const run = (s: EncounterState, cmd: Command, rng = dice(), role: Role = DM) =>
  dispatch(s, cmd, { rng, role });

/** Encontro com herói (0,0) e goblin (5,0), iniciativa fixa e combate em andamento. */
function started(
  over: {
    hero?: Partial<Creature>;
    foe?: Partial<Creature>;
    foePos?: { x: number; y: number };
  } = {},
) {
  let s = newEncounter(map);
  s = run(s, { type: 'addCreature', creature: hero(over.hero), pos: { x: 0, y: 0 } });
  s = run(s, { type: 'addCreature', creature: foe(over.foe), pos: over.foePos ?? { x: 5, y: 0 } });
  s = run(s, { type: 'setInitiative', id: 'hero', value: 18 });
  s = run(s, { type: 'setInitiative', id: 'foe', value: 10 });
  return run(s, { type: 'startCombat' });
}

describe('montagem', () => {
  it('não coloca criatura em parede, fora do mapa ou sobre outra', () => {
    let s = newEncounter(map);
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 0, y: 0 } });
    s = run(s, { type: 'addCreature', creature: foe() });
    expect(() => run(s, { type: 'placeToken', id: 'foe', pos: { x: 3, y: 2 } })).toThrow(RuleError); // parede
    expect(() => run(s, { type: 'placeToken', id: 'foe', pos: { x: 9, y: 0 } })).toThrow(RuleError); // fora
    expect(() => run(s, { type: 'placeToken', id: 'foe', pos: { x: 0, y: 0 } })).toThrow(RuleError); // ocupado
  });

  it('criatura grande ocupa 2×2', () => {
    let s = newEncounter(map);
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 1, y: 0 } });
    const ogre = foe({ id: 'ogre', size: 'large' });
    expect(() => run(s, { type: 'addCreature', creature: ogre, pos: { x: 0, y: 0 } })).toThrow(
      RuleError,
    ); // sobrepõe o herói
    s = run(s, { type: 'addCreature', creature: ogre, pos: { x: 3, y: 0 } });
    expect(tokenOf(s, 'ogre')?.pos).toEqual({ x: 3, y: 0 });
  });

  it('não altera o estado anterior', () => {
    const s = newEncounter(map);
    run(s, { type: 'addCreature', creature: hero(), pos: { x: 0, y: 0 } });
    expect(s.creatures).toHaveLength(0);
    expect(s.tokens).toHaveLength(0);
  });
});

describe('iniciativa e turnos', () => {
  it('rola d20 + Destreza para quem está no mapa', () => {
    let s = newEncounter(map);
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 0, y: 0 } }); // dex 14 → +2
    s = run(s, { type: 'addCreature', creature: foe(), pos: { x: 5, y: 0 } }); // dex 10 → +0
    s = run(s, { type: 'rollInitiative' }, dice([20, 10], [20, 15]));
    expect(s.combat.initiative).toEqual({ hero: 12, foe: 15 });
  });

  it('ordena por iniciativa e desempata por Destreza', () => {
    let s = newEncounter(map);
    s = run(s, { type: 'addCreature', creature: foe({ id: 'slow' }), pos: { x: 0, y: 0 } });
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 1, y: 0 } });
    s = run(s, {
      type: 'addCreature',
      creature: foe({
        id: 'fast',
        abilities: { str: 8, dex: 18, con: 10, int: 10, wis: 8, cha: 8 },
      }),
      pos: { x: 2, y: 0 },
    });
    for (const id of ['slow', 'hero', 'fast']) s = run(s, { type: 'setInitiative', id, value: 12 });
    s = run(s, { type: 'startCombat' });
    expect(s.combat.order).toEqual(['fast', 'hero', 'slow']); // dex 18, 14, 10
    expect(s.combat.round).toBe(1);
    expect(s.combat.turn?.actorId).toBe('fast');
  });

  it('não inicia sem iniciativa nem com combate em andamento', () => {
    expect(() => run(newEncounter(map), { type: 'startCombat' })).toThrow(RuleError);
    expect(() => run(started(), { type: 'startCombat' })).toThrow(RuleError);
  });

  it('endTurn passa a vez, conta rodadas e zera o orçamento', () => {
    let s = started();
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 1, y: 0 } });
    expect(s.combat.turn?.movedFt).toBe(5);
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    expect(s.combat.turn?.actorId).toBe('foe');
    expect(s.combat.round).toBe(1);
    s = run(s, { type: 'endTurn', actorId: 'foe' });
    expect(s.combat.turn).toMatchObject({ actorId: 'hero', movedFt: 0, action: true });
    expect(s.combat.round).toBe(2);
  });

  it('pula quem está morto', () => {
    let s = newEncounter(map);
    for (const [c, x] of [
      [hero(), 0],
      [foe({ status: 'dead' }), 1],
      [foe({ id: 'foe2', name: 'Outro' }), 2],
    ] as const) {
      s = run(s, { type: 'addCreature', creature: c, pos: { x, y: 0 } });
      s = run(s, { type: 'setInitiative', id: c.id, value: 20 - x });
    }
    s = run(s, { type: 'startCombat' });
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    expect(s.combat.turn?.actorId).toBe('foe2');
  });

  it('só age quem está na vez', () => {
    const s = started();
    expect(() => run(s, { type: 'move', actorId: 'foe', to: { x: 6, y: 0 } })).toThrow(/vez/);
    expect(() => run(s, { type: 'endTurn', actorId: 'foe' })).toThrow(RuleError);
  });
});

describe('movimento', () => {
  it('consome o deslocamento e recusa o que passa do limite', () => {
    let s = started();
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 4, y: 1 } }); // 4 células = 20 ft
    expect(s.combat.turn?.movedFt).toBe(20);
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 4, y: 4 } })).toThrow(/alcance/); // +15 > 10 restantes
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 5, y: 1 } }); // +5
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 5, y: 1 });
  });

  it('Disparada dobra o deslocamento, uma vez por ação', () => {
    let s = started();
    s = run(s, { type: 'dash', actorId: 'hero' });
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 7, y: 0 } }); // 7 células = 35 ft ≤ 60
    expect(s.combat.turn?.movedFt).toBe(35);
    expect(() => run(s, { type: 'dash', actorId: 'hero' })).toThrow(/ação/);
  });

  it('passa por aliado, é barrado por hostil e não termina sobre ninguém', () => {
    let s = newEncounter(mapFromAscii(['.....']));
    s = run(s, { type: 'addCreature', creature: hero(), pos: { x: 0, y: 0 } });
    s = run(s, {
      type: 'addCreature',
      creature: hero({ id: 'ally', name: 'Aliado' }),
      pos: { x: 1, y: 0 },
    });
    s = run(s, { type: 'addCreature', creature: foe(), pos: { x: 3, y: 0 } });
    for (const [id, v] of [
      ['hero', 20],
      ['ally', 15],
      ['foe', 10],
    ] as const)
      s = run(s, { type: 'setInitiative', id, value: v });
    s = run(s, { type: 'startCombat' });
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 1, y: 0 } })).toThrow(RuleError); // sobre o aliado
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 4, y: 0 } })).toThrow(RuleError); // hostil bloqueia o corredor
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 2, y: 0 } }); // atravessa o aliado
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 2, y: 0 });
  });

  it('não se move fora do combate', () => {
    const s = run(newEncounter(map), {
      type: 'addCreature',
      creature: hero(),
      pos: { x: 0, y: 0 },
    });
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 1, y: 0 } })).toThrow(RuleError);
  });
});

describe('ataques', () => {
  const adjacent = { foePos: { x: 1, y: 0 } };

  it('acerta, rola o dano e aplica em PV', () => {
    let s = started(adjacent);
    // d20 = 10 (+5 = 15 ≥ CA 12) e d8 = 4 (+3 = 7)
    s = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 10], [8, 4]),
    );
    expect(s.creatures.find((c) => c.id === 'foe')?.hp.current).toBe(13);
    expect(s.log.at(-1)?.text).toContain('acerto');
    expect(s.combat.turn).toMatchObject({ action: false, attacksLeft: 1 });
  });

  it('erra quando o total não alcança a CA e 1 natural sempre erra', () => {
    let s = started(adjacent);
    s = run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, dice([20, 5])); // 5+5 = 10 < 12
    expect(s.creatures.find((c) => c.id === 'foe')?.hp.current).toBe(20);
    expect(s.log.at(-1)?.text).toContain('erro');
    s = run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, dice([20, 1]));
    expect(s.log.at(-1)?.text).toContain('erro');
  });

  it('20 natural é crítico: dobra os dados de dano', () => {
    let s = started(adjacent);
    // 2d8 (não 1d8) + 3: dados 5 e 6 → 14
    s = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 20], [8, 5], [8, 6]),
    );
    expect(s.creatures.find((c) => c.id === 'foe')?.hp.current).toBe(20 - 14);
    expect(s.log.at(-1)?.text).toContain('CRÍTICO');
  });

  it('Ataque Extra: o segundo ataque não gasta outra ação; o terceiro é recusado', () => {
    let s = started(adjacent);
    const hit = () => dice([20, 15], [8, 1]);
    s = run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, hit());
    s = run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, hit());
    expect(s.combat.turn).toMatchObject({ action: false, attacksLeft: 0 });
    expect(() =>
      run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, hit()),
    ).toThrow(/ação/);
  });

  it('recusa alvo fora de alcance', () => {
    const s = started(); // goblin a 25 ft
    expect(() =>
      run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }),
    ).toThrow(/alcance/);
    // arco (60 ft) alcança
    expect(() =>
      run(
        s,
        { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 1 },
        dice([20, 10], [8, 1]),
      ),
    ).not.toThrow();
  });

  it('atirar com inimigo adjacente tem desvantagem', () => {
    const s = started(adjacent);
    // desvantagem: 2d20 e fica o menor (18 e 4 → 4 + 5 = 9 < 12 = erro)
    const r = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 1 },
      dice([20, 18], [20, 4]),
    );
    expect(r.log.at(-1)?.text).toContain('desvantagem');
    expect(r.log.at(-1)?.text).toContain('erro');
  });

  it('Esquiva dá desvantagem a quem ataca, até o início do turno do esquivador', () => {
    let s = started(adjacent);
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    s = run(s, { type: 'dodge', actorId: 'foe' });
    s = run(s, { type: 'endTurn', actorId: 'foe' });
    const r = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 18], [20, 3]),
    );
    expect(r.log.at(-1)?.text).toContain('desvantagem');
    // no turno seguinte do goblin a Esquiva acaba
    const t = run(r, { type: 'endTurn', actorId: 'hero' });
    expect(t.combat.dodging).not.toContain('foe');
  });

  it('não ataca a si, morto, oculto (jogador) nem sem ataque cadastrado', () => {
    const s = started(adjacent);
    expect(() =>
      run(s, { type: 'attack', actorId: 'hero', targetId: 'hero', attackIndex: 0 }),
    ).toThrow(RuleError);
    expect(() =>
      run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 9 }),
    ).toThrow(RuleError);
    const hidden = run(s, { type: 'setHidden', id: 'foe', hidden: true });
    expect(() =>
      run(hidden, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }, dice(), {
        kind: 'player',
        owns: ['hero'],
      }),
    ).toThrow(/visível/);
  });

  it('matar o último inimigo encerra o combate com vitória do grupo', () => {
    let s = started({ ...adjacent, foe: { hp: { max: 5, current: 5, temp: 0 } } });
    s = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 15], [8, 8]),
    );
    expect(s.creatures.find((c) => c.id === 'foe')?.status).toBe('dead');
    expect(s.combat.phase).toBe('ended');
    expect(s.combat.outcome).toBe('party');
  });
});

describe('autorização por papel', () => {
  const player: Role = { kind: 'player', owns: ['hero'] };

  it('jogador só envia comandos de turno', () => {
    const s = started();
    expect(() => run(s, { type: 'startCombat' }, dice(), player)).toThrow(ForbiddenError);
    expect(() => run(s, { type: 'damage', targetId: 'hero', amount: 5 }, dice(), player)).toThrow(
      ForbiddenError,
    );
    expect(() =>
      run(s, { type: 'placeToken', id: 'hero', pos: { x: 7, y: 4 } }, dice(), player),
    ).toThrow(ForbiddenError);
    expect(() =>
      run(s, { type: 'addCreature', creature: foe({ id: 'x' }) }, dice(), player),
    ).toThrow(ForbiddenError);
  });

  it('jogador não controla criatura alheia', () => {
    const s = started();
    expect(() =>
      run(s, { type: 'move', actorId: 'foe', to: { x: 6, y: 0 } }, dice(), player),
    ).toThrow(ForbiddenError);
  });

  it('jogador age com a sua criatura, na vez dela, dentro das regras', () => {
    let s = started();
    s = run(s, { type: 'move', actorId: 'hero', to: { x: 2, y: 0 } }, dice(), player);
    expect(tokenOf(s, 'hero')?.pos).toEqual({ x: 2, y: 0 });
    s = run(s, { type: 'endTurn', actorId: 'hero' }, dice(), player);
    expect(() =>
      run(s, { type: 'move', actorId: 'hero', to: { x: 3, y: 0 } }, dice(), player),
    ).toThrow(/vez/);
  });
});

describe('projeção para o jogador', () => {
  it('remove tokens ocultos, entradas secretas e mascara os PV dos inimigos', () => {
    let s = started();
    s = run(s, {
      type: 'addCreature',
      creature: foe({ id: 'lurker', name: 'Espreitador', hp: { max: 40, current: 10, temp: 0 } }),
      pos: { x: 7, y: 4 },
      hidden: true,
    });
    s = run(s, { type: 'damage', targetId: 'lurker', amount: 1 }); // log secreto
    const player: Role = { kind: 'player', owns: ['hero'] };
    const view = project(s, player);

    expect(view.tokens.map((t) => t.creatureId)).toEqual(['hero', 'foe']);
    expect(view.creatures.map((c) => c.id)).toEqual(['hero', 'foe']);
    expect(JSON.stringify(view)).not.toContain('Espreitador');
    const goblin = view.creatures.find((c) => c.id === 'foe')!;
    expect(goblin.hp).toEqual({ max: 100, current: 100, temp: 0 });
    expect(goblin.attacks).toEqual([]);
    expect(view.creatures.find((c) => c.id === 'hero')?.attacks).toHaveLength(2);
  });

  it('o Mestre vê tudo', () => {
    const s = started();
    expect(project(s, DM)).toBe(s);
  });
});

describe('remoção durante o combate', () => {
  it('remover quem está na vez passa para o próximo', () => {
    let s = started();
    s = run(s, {
      type: 'addCreature',
      creature: hero({ id: 'ally', name: 'Aliado' }),
      pos: { x: 0, y: 4 },
    });
    s = run(s, { type: 'endCombat' });
    s = run(s, { type: 'setInitiative', id: 'hero', value: 18 });
    s = run(s, { type: 'setInitiative', id: 'ally', value: 14 });
    s = run(s, { type: 'setInitiative', id: 'foe', value: 10 });
    s = run(s, { type: 'startCombat' });
    s = run(s, { type: 'removeCreature', id: 'hero' });
    expect(s.combat.order).toEqual(['ally', 'foe']);
    expect(s.combat.turn?.actorId).toBe('ally');
  });

  it('remover o último do grupo encerra o combate com derrota', () => {
    const s = run(started(), { type: 'removeCreature', id: 'hero' });
    expect(s.combat.phase).toBe('ended');
    expect(s.combat.outcome).toBe('foes');
  });

  it('salvaguarda contra a morte só na vez de quem está morrendo', () => {
    let s = started();
    s = run(s, { type: 'damage', targetId: 'hero', amount: 30 }); // 0 PV, morrendo
    expect(s.creatures.find((c) => c.id === 'hero')?.status).toBe('dying');
    s = run(s, { type: 'deathSave', actorId: 'hero' }, dice([20, 12]));
    expect(s.creatures.find((c) => c.id === 'hero')?.deathSaves.successes).toBe(1);
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 1, y: 0 } })).toThrow(/agir/);
  });
});

describe('condições no combate', () => {
  const adj = { foePos: { x: 1, y: 0 } };
  const cond = (
    name: 'paralyzed' | 'prone' | 'stunned' | 'grappled' | 'poisoned',
    rounds?: number,
  ) => ({
    conditions: [{ name, ...(rounds ? { rounds } : {}) }],
  });

  it('atordoado não age nem se move', () => {
    const s = started({ ...adj, hero: cond('stunned') });
    expect(() =>
      run(s, { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 }),
    ).toThrow(/não pode agir/);
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 0, y: 1 } })).toThrow(
      /não pode agir/,
    );
    expect(run(s, { type: 'endTurn', actorId: 'hero' }).combat.turn?.actorId).toBe('foe'); // ainda pode passar a vez
  });

  it('agarrado não tem deslocamento', () => {
    const s = started({ hero: cond('grappled') });
    expect(() => run(s, { type: 'move', actorId: 'hero', to: { x: 0, y: 1 } })).toThrow(
      /deslocamento/,
    );
  });

  it('alvo caído recebe ataque corpo a corpo com vantagem', () => {
    const s = started({ ...adj, foe: cond('prone') });
    // vantagem: 2d20, fica o maior (3 e 19 → 19)
    const r = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 3], [20, 19], [8, 1]),
    );
    expect(r.log.at(-1)?.text).toContain('(vantagem)');
    expect(r.log.at(-1)?.text).toContain('acerto');
  });

  it('acerto em paralisado a 5 ft é crítico automático (dobra os dados)', () => {
    const s = started({ ...adj, foe: cond('paralyzed') });
    // vantagem por paralisado (2d20) e depois 2d8 por causa do crítico: 4 e 5 + 3 = 12
    const r = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 12], [20, 14], [8, 4], [8, 5]),
    );
    expect(r.log.at(-1)?.text).toContain('CRÍTICO');
    expect(r.creatures.find((c) => c.id === 'foe')?.hp.current).toBe(20 - 12);
  });

  it('atacante envenenado tem desvantagem', () => {
    const s = started({ ...adj, hero: cond('poisoned') });
    const r = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 18], [20, 2]),
    );
    expect(r.log.at(-1)?.text).toContain('(desvantagem)');
    expect(r.log.at(-1)?.text).toContain('erro');
  });

  it('duração em rodadas: desconta no fim do turno de quem tem a condição e expira', () => {
    let s = started({ hero: cond('poisoned', 2) });
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    expect(s.creatures.find((c) => c.id === 'hero')?.conditions).toEqual([
      { name: 'poisoned', rounds: 1 },
    ]);
    s = run(s, { type: 'endTurn', actorId: 'foe' });
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    expect(s.creatures.find((c) => c.id === 'hero')?.conditions).toEqual([]);
    expect(s.log.some((e) => e.text.includes('Envenenado terminou'))).toBe(true);
  });

  it('levantar-se gasta metade do deslocamento e remove Caído', () => {
    let s = started({ hero: cond('prone') });
    s = run(s, { type: 'standUp', actorId: 'hero' });
    expect(s.creatures.find((c) => c.id === 'hero')?.conditions).toEqual([]);
    expect(s.combat.turn?.movedFt).toBe(15);
    expect(() => run(s, { type: 'standUp', actorId: 'hero' })).toThrow(/não está caído/);
  });

  it('só o Mestre aplica condições', () => {
    const s = started();
    const player: Role = { kind: 'player', owns: ['hero'] };
    expect(() =>
      run(s, { type: 'addCondition', targetId: 'foe', condition: 'stunned' }, dice(), player),
    ).toThrow(ForbiddenError);
    const r = run(s, { type: 'addCondition', targetId: 'foe', condition: 'stunned', rounds: 2 });
    expect(r.creatures.find((c) => c.id === 'foe')?.conditions).toEqual([
      { name: 'stunned', rounds: 2 },
    ]);
  });
});

describe('concentração no combate', () => {
  const adj = { foePos: { x: 1, y: 0 } };
  const focused = {
    concentration: 'Bênção',
    abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 8, cha: 8 },
  };

  it('dano pede salvaguarda de Constituição (CD 10 ou metade do dano)', () => {
    let s = started({ ...adj, foe: focused });
    // acerta (15+5), dano 1d8+3 = 4+3 = 7 → CD 10; salvaguarda d20 12 (+0) = 12: mantém
    s = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 15], [8, 4], [20, 12]),
    );
    expect(s.creatures.find((c) => c.id === 'foe')?.concentration).toBe('Bênção');
    expect(s.log.at(-1)?.text).toContain('mantida');
  });

  it('falhar na salvaguarda perde a concentração', () => {
    let s = started({ ...adj, foe: focused });
    s = run(
      s,
      { type: 'attack', actorId: 'hero', targetId: 'foe', attackIndex: 0 },
      dice([20, 15], [8, 4], [20, 5]),
    );
    expect(s.creatures.find((c) => c.id === 'foe')?.concentration).toBeUndefined();
    expect(s.log.at(-1)?.text).toContain('perdida');
  });

  it('cair a 0 PV encerra a concentração sem salvaguarda', () => {
    let s = started({ ...adj, hero: { ...focused, hp: { max: 30, current: 30, temp: 0 } } });
    s = run(s, { type: 'damage', targetId: 'hero', amount: 30 });
    expect(s.creatures.find((c) => c.id === 'hero')?.concentration).toBeUndefined();
    expect(s.log.at(-1)?.text).toContain('perde a concentração');
  });
});
