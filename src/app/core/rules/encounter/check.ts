import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Spell } from '../../models/spell';
import { skillBonus } from '../creature';
import { rollD20, Rng } from '../dice';
import { T } from '../i18n';
import { addLog, creatureOf, teamOf } from './state';

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Teste de perícia de uma habilidade (Detectar: Sabedoria (Percepção)). O motor rola, registra e
 * revela quem está escondido do outro lado e tirou, na Furtividade passiva, menos que o resultado.
 */
export function skillCheckAbility(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  rng: Rng,
): EncounterState {
  const skill = spell.check!.skill;
  const bonus = skillBonus(caster, skill);
  const r = rollD20(bonus, 'normal', rng);
  let s = addLog(
    state,
    T(
      `${caster.name}: teste de ${skill} d20 ${r.natural} ${fmt(bonus)} = ${r.roll.total}.`,
      `${caster.name}: ${skill} check d20 ${r.natural} ${fmt(bonus)} = ${r.roll.total}.`,
    ),
    [caster.id],
  );
  const found: string[] = [];
  s = {
    ...s,
    tokens: s.tokens.map((t) => {
      if (!t.hidden) return t;
      const c = creatureOf(s, t.creatureId);
      if (teamOf(c) === teamOf(caster)) return t;
      if (10 + skillBonus(c, 'stealth') > r.roll.total) return t;
      found.push(c.name);
      return { ...t, hidden: false };
    }),
  };
  if (found.length)
    s = addLog(
      s,
      T(
        `${caster.name} descobre ${found.join(', ')}.`,
        `${caster.name} spots ${found.join(', ')}.`,
      ),
      [caster.id],
    );
  return s;
}
