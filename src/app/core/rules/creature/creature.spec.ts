import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import {
  abilityMod,
  addTempHp,
  applyDamage,
  fullCasterSlots,
  heal,
  passivePerception,
  proficiencyBonus,
  rest,
  rollDeathSave,
  RuleError,
  saveBonus,
  skillBonus,
  spellSaveDc,
  spendResource,
  spendSlot,
  stabilize,
} from './index';

const pc = (over: Partial<Creature> = {}) =>
  newCreature('pc', { hp: { max: 20, current: 20, temp: 0 }, ...over });
/** RNG que faz o d20 sair com o valor pedido. */
const d20 = (v: number) => () => (v - 1 + 0.5) / 20;

describe('atributos e perícias', () => {
  it.each([
    [1, -5],
    [8, -1],
    [10, 0],
    [11, 0],
    [15, 2],
    [20, 5],
  ])('modificador de %i = %i', (score, mod) => expect(abilityMod(score)).toBe(mod));

  it('bônus de proficiência por nível e por ND', () => {
    expect(proficiencyBonus({ kind: 'pc', level: 1 })).toBe(2);
    expect(proficiencyBonus({ kind: 'pc', level: 5 })).toBe(3);
    expect(proficiencyBonus({ kind: 'pc', level: 9 })).toBe(4);
    expect(proficiencyBonus({ kind: 'pc', level: 17 })).toBe(6);
    expect(proficiencyBonus({ kind: 'monster', level: 1, cr: 0.25 })).toBe(2);
    expect(proficiencyBonus({ kind: 'monster', level: 1, cr: 5 })).toBe(3);
    expect(proficiencyBonus({ kind: 'monster', level: 1, cr: 30 })).toBe(9);
  });

  it('salvaguarda, perícia (proficiente e especialista) e percepção passiva', () => {
    const c = pc({
      level: 5, // +3
      abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 14, cha: 10 },
      saveProficiencies: ['str'],
      skills: { athletics: 'expertise', perception: 'proficient', stealth: undefined },
    });
    expect(saveBonus(c, 'str')).toBe(3 + 3);
    expect(saveBonus(c, 'dex')).toBe(0);
    expect(skillBonus(c, 'athletics')).toBe(3 + 6);
    expect(skillBonus(c, 'perception')).toBe(2 + 3);
    expect(skillBonus(c, 'stealth')).toBe(0);
    expect(passivePerception(c)).toBe(15);
  });

  it('CD de magia', () => {
    expect(
      spellSaveDc(
        pc({ level: 5, abilities: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } }),
        'int',
      ),
    ).toBe(8 + 3 + 4);
  });
});

describe('dano e cura', () => {
  it('reduz PV', () => {
    const r = applyDamage(pc(), 7);
    expect(r.creature.hp.current).toBe(13);
    expect(r.dropped).toBe(false);
  });

  it('PV temporários absorvem primeiro', () => {
    const c = pc({ hp: { max: 20, current: 20, temp: 5 } });
    const r = applyDamage(c, 8);
    expect(r.absorbedByTemp).toBe(5);
    expect(r.creature.hp).toEqual({ max: 20, current: 17, temp: 0 });
  });

  it('PV nunca fica negativo e PJ a 0 fica morrendo', () => {
    const r = applyDamage(pc(), 25);
    expect(r.creature.hp.current).toBe(0);
    expect(r.creature.status).toBe('dying');
    expect(r.dropped).toBe(true);
    expect(r.instantDeath).toBe(false);
  });

  it('monstro a 0 PV morre', () => {
    const m = newCreature('monster', { hp: { max: 13, current: 13, temp: 0 } });
    expect(applyDamage(m, 13).creature.status).toBe('dead');
  });

  it('morte instantânea quando o excedente ≥ PV máximo', () => {
    const r = applyDamage(pc(), 40); // 20 até 0 + 20 excedente = PV máx
    expect(r.instantDeath).toBe(true);
    expect(r.creature.status).toBe('dead');
  });

  it('nocaute (SRD 2024): deixa com 1 PV e estável em vez de derrubar', () => {
    const r = applyDamage(pc(), 25, { knockOut: true });
    expect(r.creature.hp.current).toBe(1);
    expect(r.creature.status).toBe('stable');
    expect(r.dropped).toBe(true);
    expect(r.instantDeath).toBe(false);
  });

  it('nocaute também evita a morte instantânea de um monstro', () => {
    const m = newCreature('monster', { hp: { max: 13, current: 13, temp: 0 } });
    const r = applyDamage(m, 40, { knockOut: true });
    expect(r.creature.status).toBe('stable');
    expect(r.creature.hp.current).toBe(1);
  });

  it('nocaute não se aplica se o golpe não derruba (PV positivos, sem efeito extra)', () => {
    const r = applyDamage(pc(), 5, { knockOut: true });
    expect(r.creature.hp.current).toBe(15);
    expect(r.creature.status).toBe('alive');
  });

  it('resistência divide (arredonda para baixo), vulnerabilidade dobra, imunidade zera', () => {
    const c = pc({ resistances: ['fire'], vulnerabilities: ['cold'], immunities: ['poison'] });
    expect(applyDamage(c, 7, { type: 'fire' }).dealt).toBe(3);
    expect(applyDamage(c, 7, { type: 'cold' }).dealt).toBe(14);
    expect(applyDamage(c, 7, { type: 'poison' }).dealt).toBe(0);
    expect(applyDamage(c, 7, { type: 'acid' }).dealt).toBe(7);
    expect(
      applyDamage(pc({ resistances: ['fire'], vulnerabilities: ['fire'] }), 7, { type: 'fire' })
        .dealt,
    ).toBe(7);
  });

  it('dano a 0 PV causa falhas de morte (crítico = 2) e 3 falhas matam', () => {
    let c = applyDamage(pc(), 20).creature; // 0 PV, morrendo
    c = applyDamage(c, 3).creature;
    expect(c.deathSaves.failures).toBe(1);
    c = applyDamage(c, 3, { crit: true }).creature;
    expect(c.deathSaves.failures).toBe(3);
    expect(c.status).toBe('dead');
  });

  it('cura limita ao máximo, reanima quem estava a 0 e zera as salvaguardas', () => {
    let c = applyDamage(pc(), 20).creature;
    c = applyDamage(c, 1).creature;
    c = heal(c, 5);
    expect(c.hp.current).toBe(5);
    expect(c.status).toBe('alive');
    expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(heal(c, 999).hp.current).toBe(20);
  });

  it('cura não ressuscita quem está morto', () => {
    const dead = pc({ status: 'dead', hp: { max: 20, current: 0, temp: 0 } });
    expect(heal(dead, 10).hp.current).toBe(0);
  });

  it('PV temporários não se acumulam: vale o maior', () => {
    const c = addTempHp(addTempHp(pc(), 5), 3);
    expect(c.hp.temp).toBe(5);
    expect(addTempHp(c, 9).hp.temp).toBe(9);
  });

  it('valores inválidos lançam erro', () => {
    expect(() => applyDamage(pc(), -1)).toThrow(RuleError);
    expect(() => heal(pc(), NaN)).toThrow(RuleError);
  });

  it('não muta a criatura original', () => {
    const c = pc();
    applyDamage(c, 5);
    expect(c.hp.current).toBe(20);
  });
});

describe('salvaguarda contra a morte', () => {
  const dying = () => applyDamage(pc(), 20).creature;

  it('10+ é sucesso; abaixo de 10, falha', () => {
    expect(rollDeathSave(dying(), d20(10)).creature.deathSaves).toEqual({
      successes: 1,
      failures: 0,
    });
    expect(rollDeathSave(dying(), d20(9)).creature.deathSaves).toEqual({
      successes: 0,
      failures: 1,
    });
  });

  it('1 natural = 2 falhas', () => {
    const r = rollDeathSave(dying(), d20(1));
    expect(r.creature.deathSaves.failures).toBe(2);
    expect(r.outcome).toBe('critical-failure');
  });

  it('20 natural volta com 1 PV', () => {
    const r = rollDeathSave(dying(), d20(20));
    expect(r.creature.hp.current).toBe(1);
    expect(r.creature.status).toBe('alive');
  });

  it('3 sucessos estabilizam; 3 falhas matam', () => {
    let c = dying();
    for (let i = 0; i < 3; i++) c = rollDeathSave(c, d20(15)).creature;
    expect(c.status).toBe('stable');

    let d = dying();
    for (let i = 0; i < 3; i++) d = rollDeathSave(d, d20(5)).creature;
    expect(d.status).toBe('dead');
  });

  it('só quem está morrendo rola', () => {
    expect(() => rollDeathSave(pc(), d20(10))).toThrow(RuleError);
  });

  it('estabilizar zera o contador', () => {
    const c = stabilize(applyDamage(pc(), 20).creature);
    expect(c.status).toBe('stable');
  });
});

describe('espaços de magia, recursos e descanso', () => {
  it('tabela de conjurador completo', () => {
    expect(fullCasterSlots(1)).toEqual({ 1: { max: 2, used: 0 } });
    expect(fullCasterSlots(5)).toEqual({
      1: { max: 4, used: 0 },
      2: { max: 3, used: 0 },
      3: { max: 2, used: 0 },
    });
    expect(Object.keys(fullCasterSlots(20))).toHaveLength(9);
  });

  it('gasta e esgota espaços', () => {
    let c = pc({ spellSlots: fullCasterSlots(3) }); // 4 de 1º, 2 de 2º
    c = spendSlot(c, 2);
    c = spendSlot(c, 2);
    expect(c.spellSlots[2].used).toBe(2);
    expect(() => spendSlot(c, 2)).toThrow(RuleError);
    expect(() => spendSlot(c, 3)).toThrow(RuleError);
  });

  it('descanso curto recupera só recursos "short"; longo recupera tudo', () => {
    let c = pc({
      spellSlots: fullCasterSlots(3),
      resources: [
        { name: 'Surto', max: 1, used: 0, recharge: 'short' },
        { name: 'Fúria', max: 3, used: 0, recharge: 'long' },
      ],
      hp: { max: 20, current: 5, temp: 4 },
    });
    c = spendSlot(spendResource(spendResource(c, 'Surto'), 'Fúria'), 1);

    const short = rest(c, 'short');
    expect(short.resources.find((r) => r.name === 'Surto')!.used).toBe(0);
    expect(short.resources.find((r) => r.name === 'Fúria')!.used).toBe(1);
    expect(short.spellSlots[1].used).toBe(1);
    expect(short.hp.current).toBe(5);

    const long = rest(c, 'long');
    expect(long.resources.every((r) => r.used === 0)).toBe(true);
    expect(long.spellSlots[1].used).toBe(0);
    expect(long.hp).toEqual({ max: 20, current: 20, temp: 4 });
  });

  it('descanso não ressuscita os mortos', () => {
    const dead = pc({ status: 'dead', hp: { max: 20, current: 0, temp: 0 } });
    expect(rest(dead, 'long').status).toBe('dead');
  });
});
