import { Creature, DamageType } from '../../models/creature';
import { Rng } from '../dice';
import { RuleError } from './stats';

export interface DamageResult {
  creature: Creature;
  /** Dano depois de resistência/vulnerabilidade/imunidade. */
  dealt: number;
  absorbedByTemp: number;
  hpLost: number;
  /** Ficou com 0 PV nesta aplicação. */
  dropped: boolean;
  /** Dano excedente ≥ PV máximos: morte instantânea. */
  instantDeath: boolean;
}

export interface DamageOptions {
  type?: DamageType;
  /** Acerto crítico contra criatura a 0 PV vale 2 falhas de morte. */
  crit?: boolean;
}

const nonNeg = (n: number, what: string): number => {
  if (!Number.isFinite(n) || n < 0) throw new RuleError(`${what} deve ser um número ≥ 0.`);
  return Math.floor(n);
};

function adjust(c: Creature, amount: number, type?: DamageType): number {
  if (!type) return amount;
  if (c.immunities.includes(type)) return 0;
  const resisted = c.resistances.includes(type);
  const vulnerable = c.vulnerabilities.includes(type);
  if (resisted && !vulnerable) return Math.floor(amount / 2);
  if (vulnerable && !resisted) return amount * 2;
  return amount; // resistência e vulnerabilidade se anulam
}

export function applyDamage(c: Creature, amount: number, opts: DamageOptions = {}): DamageResult {
  const dealt = adjust(c, nonNeg(amount, 'Dano'), opts.type);
  if (c.status === 'dead' || dealt === 0) {
    return {
      creature: c,
      dealt,
      absorbedByTemp: 0,
      hpLost: 0,
      dropped: false,
      instantDeath: false,
    };
  }

  // A 0 PV: dano causa falhas de morte (PJ/PNJ) em vez de reduzir PV.
  if (c.hp.current === 0) {
    const add = opts.crit ? 2 : 1;
    const failures = Math.min(3, c.deathSaves.failures + add);
    const dead = failures >= 3 || dealt >= c.hp.max;
    return {
      creature: {
        ...c,
        status: dead ? 'dead' : 'dying',
        deathSaves: { ...c.deathSaves, failures },
      },
      dealt,
      absorbedByTemp: 0,
      hpLost: 0,
      dropped: false,
      instantDeath: dealt >= c.hp.max,
    };
  }

  const absorbedByTemp = Math.min(c.hp.temp, dealt);
  const remaining = dealt - absorbedByTemp;
  const hpLost = Math.min(c.hp.current, remaining);
  const overflow = remaining - hpLost;
  const current = c.hp.current - hpLost;
  const instantDeath = current === 0 && overflow >= c.hp.max;
  const dropped = current === 0;

  const status =
    instantDeath || (dropped && c.kind === 'monster') ? 'dead' : dropped ? 'dying' : c.status;
  return {
    creature: {
      ...c,
      hp: { ...c.hp, current, temp: c.hp.temp - absorbedByTemp },
      status,
      deathSaves: dropped ? { successes: 0, failures: 0 } : c.deathSaves,
    },
    dealt,
    absorbedByTemp,
    hpLost,
    dropped,
    instantDeath,
  };
}

export function heal(c: Creature, amount: number): Creature {
  const n = nonNeg(amount, 'Cura');
  if (c.status === 'dead' || n === 0) return c;
  const current = Math.min(c.hp.max, c.hp.current + n);
  return {
    ...c,
    hp: { ...c.hp, current },
    status: current > 0 ? 'alive' : c.status,
    deathSaves: current > 0 ? { successes: 0, failures: 0 } : c.deathSaves,
  };
}

/** PV temporários não se acumulam: vale o maior valor. */
export function addTempHp(c: Creature, amount: number): Creature {
  const n = nonNeg(amount, 'PV temporário');
  return n > c.hp.temp ? { ...c, hp: { ...c.hp, temp: n } } : c;
}

export interface DeathSaveResult {
  creature: Creature;
  roll: number;
  outcome: 'success' | 'failure' | 'revived' | 'stable' | 'dead' | 'critical-failure';
}

/** Salvaguarda contra a morte: 10+ sucesso, 1 = 2 falhas, 20 = volta com 1 PV. */
export function rollDeathSave(c: Creature, rng: Rng = Math.random): DeathSaveResult {
  if (c.status !== 'dying')
    throw new RuleError('Só quem está morrendo faz salvaguarda contra a morte.');
  const roll = 1 + Math.floor(rng() * 20);
  if (roll === 20) {
    return {
      creature: {
        ...c,
        hp: { ...c.hp, current: 1 },
        status: 'alive',
        deathSaves: { successes: 0, failures: 0 },
      },
      roll,
      outcome: 'revived',
    };
  }
  let { successes, failures } = c.deathSaves;
  if (roll === 1) failures += 2;
  else if (roll >= 10) successes += 1;
  else failures += 1;
  failures = Math.min(3, failures);
  successes = Math.min(3, successes);

  if (failures >= 3) {
    return {
      creature: { ...c, status: 'dead', deathSaves: { successes, failures } },
      roll,
      outcome: 'dead',
    };
  }
  if (successes >= 3) {
    return {
      creature: { ...c, status: 'stable', deathSaves: { successes, failures } },
      roll,
      outcome: 'stable',
    };
  }
  const outcome = roll === 1 ? 'critical-failure' : roll >= 10 ? 'success' : 'failure';
  return { creature: { ...c, deathSaves: { successes, failures } }, roll, outcome };
}

export function stabilize(c: Creature): Creature {
  if (c.status !== 'dying') return c;
  return { ...c, status: 'stable', deathSaves: { successes: 0, failures: 0 } };
}
