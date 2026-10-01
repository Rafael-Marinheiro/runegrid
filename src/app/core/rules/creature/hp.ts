import { Creature, DamageType } from '../../models/creature';
import { Rng } from '../dice';
import { allMods, cannotHeal, effectsOf, extraResist, removeEffects } from './effects';
import { RuleError } from './stats';
import { T } from '../i18n';
import { revertForm } from './form';

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
  /**
   * Nocaute (regra do SRD 2024, "Knocking Out a Creature"): em vez de derrubar a 0 PV,
   * o ataque corpo a corpo deixa a criatura com 1 PV e inconsciente, sem risco de morte.
   */
  knockOut?: boolean;
}

const nonNeg = (n: number, what: string): number => {
  if (!Number.isFinite(n) || n < 0)
    throw new RuleError(T(`${what} deve ser um número ≥ 0.`, `${what} must be a number ≥ 0.`));
  return Math.floor(n);
};

function adjust(c: Creature, amount: number, type?: DamageType): number {
  if (!type) return amount;
  const extra = extraResist(c, type);
  if (c.immunities.includes(type) || extra === 'immune') return 0;
  const resisted = c.resistances.includes(type) || extra === 'resist';
  const vulnerable = c.vulnerabilities.includes(type) || extra === 'vulnerable';
  if (resisted && !vulnerable) return Math.floor(amount / 2);
  if (vulnerable && !resisted) return amount * 2;
  return amount; // resistência e vulnerabilidade se anulam
}

export function applyDamage(c: Creature, amount: number, opts: DamageOptions = {}): DamageResult {
  let r = damage(c, amount, opts);
  if (r.dealt <= 0) return r;
  // Metamorfose (2014): ao zerar os PV da fera volta à forma normal e o excesso de dano passa para ela
  if (c.form?.hp === 'replace' && r.dropped) {
    const excess = r.dealt - r.absorbedByTemp - r.hpLost;
    const base = revertForm(c);
    const carried = excess > 0 ? damage(base, excess, {}) : null;
    r = {
      ...r,
      creature: { ...(carried?.creature ?? base), lastHit: { reverted: true } },
      dropped: carried?.dropped ?? false,
      instantDeath: carried?.instantDeath ?? false,
    };
  }
  // marcas para os traços dos monstros: último dano e Regeneração suspensa
  const stops = allMods(c).some((m) => opts.type && m.regenStops?.includes(opts.type));
  return {
    ...r,
    creature: {
      ...r.creature,
      lastHit: {
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.crit ? { crit: true } : {}),
        ...(r.creature.lastHit?.reverted ? { reverted: true } : {}),
      },
      ...(stops ? { regenBlocked: true } : {}),
    },
  };
}

function damage(c: Creature, amount: number, opts: DamageOptions): DamageResult {
  const dealt = adjust(c, nonNeg(amount, T('Dano', 'Damage')), opts.type);
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
  // Proteção contra a Morte: em vez de cair a 0 PV, fica com 1 PV e a magia acaba.
  if (dropped && effectsOf(c).some((e) => e.mods.deathWard)) {
    const warded = removeEffects(c, (e) => !!e.mods.deathWard);
    return {
      creature: { ...warded, hp: { ...c.hp, current: 1, temp: c.hp.temp - absorbedByTemp } },
      dealt,
      absorbedByTemp,
      hpLost: hpLost - 1,
      dropped: false,
      instantDeath: false,
    };
  }
  // Implacável (monstro): uma vez por descanso, dano pequeno que o derrubaria o deixa com 1 PV
  const rel = allMods(c).find((m) => m.relentless);
  if (
    dropped &&
    !instantDeath &&
    rel &&
    dealt <= rel.relentless! &&
    !c.abilityState?.['relentless']?.used
  ) {
    return {
      creature: {
        ...c,
        hp: { ...c.hp, current: 1, temp: c.hp.temp - absorbedByTemp },
        abilityState: { ...c.abilityState, relentless: { used: 1 } },
      },
      dealt,
      absorbedByTemp,
      hpLost: hpLost - 1,
      dropped: false,
      instantDeath: false,
    };
  }
  // Nocaute: em vez de cair a 0 PV, a criatura fica com 1 PV e inconsciente (estável).
  if (dropped && opts.knockOut) {
    return {
      creature: {
        ...c,
        hp: { ...c.hp, current: 1, temp: c.hp.temp - absorbedByTemp },
        status: 'stable',
        deathSaves: { successes: 0, failures: 0 },
      },
      dealt,
      absorbedByTemp,
      hpLost: hpLost - 1,
      dropped: true,
      instantDeath: false,
    };
  }

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
  const n = nonNeg(amount, T('Cura', 'Healing'));
  if (c.status === 'dead' || n === 0 || cannotHeal(c)) return c;
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
  const n = nonNeg(amount, T('PV temporário', 'Temporary HP'));
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
    throw new RuleError(
      T(
        'Só quem está morrendo faz salvaguarda contra a morte.',
        'Only a dying creature makes death saving throws.',
      ),
    );
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
