import { Ability, DamageType } from '../../models/creature';
import { EncounterState, HeldHit } from '../../models/encounter';
import { applyDamage, heal } from '../creature';
import { Rng } from '../dice';
import { getSpell } from '../spells/data';
import { aftermath, checkOutcome, dtype, notes } from './helpers';
import { offerDamaged, offerHit } from './reactions';
import { applyRiders } from './rider';
import { dropOnAttack } from './rolls';
import { addLog, creatureOf, withCreature } from './state';

/** Aplica o dano de um golpe que acertou (e, se for magia, as condições/efeitos que ela traz). */
export function applyHeldHit(state: EncounterState, hit: HeldHit, rng: Rng): EncounterState {
  const target = creatureOf(state, hit.targetId);
  let cur = target;
  let dealtTotal = 0;
  const lines: string[] = [];
  hit.parts.forEach((p, i) => {
    const r = applyDamage(cur, Math.max(0, p.amount), {
      type: p.type as DamageType,
      crit: hit.crit,
      knockOut: i === 0 && hit.knockOut,
    });
    cur = r.creature;
    dealtTotal += r.dealt;
    lines.push(`${r.dealt} de dano ${dtype(p.type as DamageType)}${notes(r)}`);
  });
  let s = withCreature(state, cur);
  const what = `${hit.head} — ${hit.crit ? 'ACERTO CRÍTICO' : 'acerto'}`;
  s = addLog(s, lines.length ? `${what}: ${lines.join(' + ')}.` : `${what}.`, [
    hit.attackerId,
    hit.targetId,
  ]);
  if (dealtTotal > 0) s = aftermath(s, hit.targetId, dealtTotal, rng);
  const r = hit.rider;
  if (r) {
    const spell = getSpell(r.spellId, r.ruleset);
    const caster = creatureOf(s, hit.attackerId);
    if (spell?.damage?.lifesteal && dealtTotal > 0) {
      const back = Math.floor(dealtTotal * spell.damage.lifesteal);
      const who = creatureOf(s, hit.attackerId);
      if (back > 0) {
        s = withCreature(s, heal(who, back));
        s = addLog(s, `${who.name} recupera ${back} PV.`, [who.id]);
      }
    }
    if (spell && creatureOf(s, hit.targetId).status !== 'dead')
      s = applyRiders(
        s,
        caster,
        hit.targetId,
        spell,
        r.slot,
        r.dc,
        r.ability as Ability,
        rng,
        r.point,
      );
  }
  s = dropOnAttack(s, hit.attackerId);
  if (dealtTotal > 0 && creatureOf(s, hit.targetId).status !== 'dead')
    s = offerDamaged(s, hit.targetId, hit.attackerId);
  return checkOutcome(s);
}

/** O golpe acertou: ou o alvo pode reagir (Escudo Arcano) e o dano fica suspenso, ou é aplicado já. */
export function holdOrApply(state: EncounterState, hit: HeldHit, rng: Rng): EncounterState {
  return offerHit(state, hit) ?? applyHeldHit(state, hit, rng);
}
