import { T } from '../i18n';
import { Creature } from '../../models/creature';
import { RuleError } from './stats';

/** Espaços de magia por nível de magia, para conjurador completo (PHB), do nível 1 ao 20. */
const FULL_CASTER: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function fullCasterSlots(level: number): Creature['spellSlots'] {
  const row = FULL_CASTER[Math.min(20, Math.max(1, Math.floor(level))) - 1];
  return Object.fromEntries(row.map((max, i) => [i + 1, { max, used: 0 }]));
}

/** Gasta um espaço de magia do nível pedido (ou de um nível maior, ao conjurar com upcast). */
export function spendSlot(c: Creature, level: number): Creature {
  const slot = c.spellSlots[level];
  if (!slot || slot.used >= slot.max) {
    throw new RuleError(
      T(`Sem espaço de magia de ${level}º nível.`, `No level ${level} spell slot left.`),
    );
  }
  return { ...c, spellSlots: { ...c.spellSlots, [level]: { ...slot, used: slot.used + 1 } } };
}

/** Devolve um espaço gasto (correção manual do Mestre). */
export function restoreSlot(c: Creature, level: number): Creature {
  const slot = c.spellSlots[level];
  if (!slot || slot.used <= 0) return c;
  return { ...c, spellSlots: { ...c.spellSlots, [level]: { ...slot, used: slot.used - 1 } } };
}

export function spendResource(c: Creature, name: string): Creature {
  const res = c.resources.find((r) => r.name === name);
  if (!res || res.used >= res.max)
    throw new RuleError(T(`Sem usos de ${name}.`, `No uses of ${name} left.`));
  return { ...c, resources: c.resources.map((r) => (r === res ? { ...r, used: r.used + 1 } : r)) };
}

/**
 * Descanso curto recupera só recursos "short". Descanso longo recupera tudo: PV,
 * espaços de magia, recursos e salvaguardas contra a morte (PV temporários não mudam).
 */
export function rest(c: Creature, kind: 'short' | 'long'): Creature {
  if (c.status === 'dead') return c;
  const resources = c.resources.map((r) =>
    kind === 'long' || r.recharge === 'short' ? { ...r, used: 0 } : r,
  );
  if (kind === 'short') return { ...c, resources, effects: keepLong(c) };

  const spellSlots = Object.fromEntries(
    Object.entries(c.spellSlots).map(([lv, s]) => [lv, { ...s, used: 0 }]),
  );
  return {
    ...c,
    resources,
    effects: undefined,
    sustained: undefined,
    concentration: undefined,
    spellSlots,
    hp: { ...c.hp, current: c.hp.max },
    status: 'alive',
    deathSaves: { successes: 0, failures: 0 },
  };
}

/** Descanso curto encerra o que dura até 1 hora (10 minutos = 100 rodadas); durações longas ficam. */
function keepLong(c: Creature): Creature['effects'] {
  const keep = (c.effects ?? []).filter((e) => e.rounds === undefined || e.rounds > 600);
  return keep.length ? keep : undefined;
}
