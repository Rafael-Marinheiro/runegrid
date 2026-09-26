import { Spell } from '../../models/spell';

/** Multiplica a quantidade de dados: `scaleDice('1d6', 3)` → `3d6`. */
export function scaleDice(dice: string, times: number): string {
  const m = /^(\d*)d(\d+)$/.exec(dice);
  if (!m) throw new Error(`Dado inválido para escalar: ${dice}`);
  return `${(m[1] === '' ? 1 : Number(m[1])) * times}d${m[2]}`;
}

/** Truques: dobra, triplica e quadruplica nos níveis 5, 11 e 17. */
export function cantripTier(casterLevel: number): number {
  return 1 + (casterLevel >= 5 ? 1 : 0) + (casterLevel >= 11 ? 1 : 0) + (casterLevel >= 17 ? 1 : 0);
}

/** Expressão de dano da magia para o espaço usado e o nível do conjurador. */
export function damageExpression(spell: Spell, slotLevel: number, casterLevel: number): string {
  const d = spell.damage;
  if (!d) throw new Error(`${spell.name} não causa dano.`);
  let expr = d.dice;
  if (d.cantrip) expr = scaleDice(d.dice, cantripTier(casterLevel));
  else if (d.perLevel && slotLevel > spell.level) {
    expr = `${expr}+${scaleDice(d.perLevel, slotLevel - spell.level)}`;
  }
  if (d.instances) {
    const n = d.instances.base + d.instances.perLevel * Math.max(0, slotLevel - spell.level);
    expr = Array.from({ length: n }, () => expr).join('+');
  }
  return expr;
}

export function healExpression(spell: Spell, slotLevel: number): string {
  const h = spell.heal;
  if (!h) throw new Error(`${spell.name} não cura.`);
  return h.perLevel && slotLevel > spell.level
    ? `${h.dice}+${scaleDice(h.perLevel, slotLevel - spell.level)}`
    : h.dice;
}
