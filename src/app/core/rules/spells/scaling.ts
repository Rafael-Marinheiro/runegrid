import { Spell, SpellDamage } from '../../models/spell';

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

/** Todos os danos da magia (o principal e os extras). */
export const damageParts = (spell: Spell): SpellDamage[] =>
  spell.damage ? [spell.damage, ...(spell.extraDamage ?? [])] : [];

/** Expressão de dano de uma parte para o espaço usado e o nível do conjurador (sem repetir por raio). */
export function partExpression(
  d: SpellDamage,
  spellLevel: number,
  slotLevel: number,
  casterLevel: number,
): string {
  let expr = d.dice;
  if (d.cantrip && !d.beams) expr = scaleDice(d.dice, cantripTier(casterLevel));
  else if (d.perLevel && slotLevel > spellLevel) {
    const steps = Math.floor((slotLevel - spellLevel) / (d.every ?? 1));
    if (steps > 0) expr = `${expr}+${scaleDice(d.perLevel, steps)}`;
  }
  return expr;
}

/** Quantos dardos/raios a magia cria para o espaço e o nível do conjurador (1 se não repete). */
export function rayCount(spell: Spell, slotLevel: number, casterLevel: number): number {
  const d = spell.damage;
  if (!d) return 1;
  if (d.beams) return cantripTier(casterLevel);
  if (d.instances)
    return d.instances.base + d.instances.perLevel * Math.max(0, slotLevel - spell.level);
  return 1;
}

/**
 * Expressão de dano da magia para o espaço usado e o nível do conjurador. Dardos de ataque
 * automático (`instances`) somam todos; raios com ataque próprio (`beams`) são rolados um a um.
 */
export function damageExpression(spell: Spell, slotLevel: number, casterLevel: number): string {
  const d = spell.damage;
  if (!d) throw new Error(`${spell.name} não causa dano.`);
  const expr = partExpression(d, spell.level, slotLevel, casterLevel);
  if (d.instances) {
    const n = rayCount(spell, slotLevel, casterLevel);
    return Array.from({ length: n }, () => expr).join('+');
  }
  return expr;
}

export function healExpression(spell: Spell, slotLevel: number): string {
  const h = spell.heal;
  if (!h?.dice) throw new Error(`${spell.name} não cura por dados.`);
  return h.perLevel && slotLevel > spell.level
    ? `${h.dice}+${scaleDice(h.perLevel, slotLevel - spell.level)}`
    : h.dice;
}

/** Cura fixa (Curar): base + por nível acima do da magia. */
export const flatHeal = (spell: Spell, slotLevel: number): number =>
  (spell.heal?.flat ?? 0) + (spell.heal?.flatPerLevel ?? 0) * Math.max(0, slotLevel - spell.level);

export const flatTemp = (spell: Spell, slotLevel: number): number =>
  (spell.tempHp?.flat ?? 0) +
  (spell.tempHp?.flatPerLevel ?? 0) * Math.max(0, slotLevel - spell.level);
