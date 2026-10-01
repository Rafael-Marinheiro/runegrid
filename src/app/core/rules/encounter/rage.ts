/** Estado da Fúria (F12, fase 4): quem a mantém, quem a perde. Separado de `abilities` para o `helpers` poder usá-lo. */
import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { effectsOf, removeEffects } from '../creature';
import { T } from '../i18n';
import { addLog, withCreature } from './state';

export const isRaging = (c: Pick<Creature, 'effects'>): boolean =>
  effectsOf(c).some((e) => e.mods.rage);

/** Dano fixo que a Fúria soma aos golpes corpo a corpo de arma. */
export const meleeDamageBonus = (c: Pick<Creature, 'effects'>): number =>
  effectsOf(c).reduce((n, e) => n + (e.mods.meleeDamage ?? 0), 0);

/** A criatura em fúria atacou ou sofreu dano: a fúria se mantém neste turno. */
export function keepRage(state: EncounterState, id: string): EncounterState {
  const c = state.creatures.find((x) => x.id === id);
  if (!c || !effectsOf(c).some((e) => e.mods.rage && !e.kept)) return state;
  return withCreature(state, {
    ...c,
    effects: effectsOf(c).map((e) => (e.mods.rage ? { ...e, kept: true } : e)),
  });
}

/** A fúria acaba se a criatura caiu, e some do estado se ela está inconsciente ou morta. */
export function endRageIfDown(state: EncounterState, id: string): EncounterState {
  const c = state.creatures.find((x) => x.id === id);
  if (!c || c.status === 'alive' || !isRaging(c)) return state;
  return addLog(
    withCreature(
      state,
      removeEffects(c, (e) => !!e.mods.rage),
    ),
    T(`A fúria de ${c.name} termina.`, `${c.name}'s rage ends.`),
    [id],
  );
}

/** No fim do turno de quem está em fúria: sem ter atacado nem sofrido dano, ela acaba. */
export function rageEndOfTurn(state: EncounterState, id: string): EncounterState {
  const c = state.creatures.find((x) => x.id === id);
  if (!c || !isRaging(c)) return state;
  const idle = effectsOf(c).some((e) => e.mods.rage && !e.kept);
  if (idle)
    return addLog(
      withCreature(
        state,
        removeEffects(c, (e) => !!e.mods.rage),
      ),
      T(
        `A fúria de ${c.name} termina: o turno passou sem atacar nem sofrer dano.`,
        `${c.name}'s rage ends: the turn passed without attacking or taking damage.`,
      ),
      [id],
    );
  return withCreature(state, {
    ...c,
    effects: effectsOf(c).map((e) => (e.mods.rage ? { ...e, kept: false } : e)),
  });
}
