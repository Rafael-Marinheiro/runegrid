/**
 * Habilidades que disparam quando o monstro morre (Explosão de Morte, Estertor…): resolvidas na
 * hora, com o monstro como origem e a CD fixa do texto.
 */
import { EncounterState } from '../../models/encounter';
import { Rng } from '../dice';
import { T, spellName } from '../i18n';
import { abilitiesOf, rulesetOfMonster } from '../monsters/registry';
import { affectedBy, resolveSpell } from './cast';
import { addLog, creatureOf, withCreature } from './state';

export function triggerDeath(state: EncounterState, id: string, rng: Rng): EncounterState {
  const c = creatureOf(state, id);
  if (c.status !== 'dead') return state;
  let s = state;
  for (const sp of abilitiesOf(c).filter((a) => a.ability?.cost === 'death')) {
    if (creatureOf(s, id).abilityState?.[sp.id]?.used) continue;
    const dead = creatureOf(s, id);
    s = withCreature(s, { ...dead, abilityState: { ...dead.abilityState, [sp.id]: { used: 1 } } });
    s = addLog(s, T(`${c.name}: ${sp.name}!`, `${c.name}: ${spellName(sp)}!`), [id]);
    const ctx = { rng, role: { kind: 'dm' as const } };
    const { creatures, dist } = affectedBy(s, sp, creatureOf(s, id), {}, 0, ctx.role);
    s = resolveSpell(s, creatureOf(s, id), sp, 0, creatures, dist, ctx, {
      ruleset: rulesetOfMonster(c.srdId ?? ''),
    });
  }
  return s;
}
