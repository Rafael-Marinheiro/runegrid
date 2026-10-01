import { Ability, DamageType } from '../../models/creature';
import { EncounterState, HeldHit } from '../../models/encounter';
import {
  addCondition,
  addEffect,
  allMods,
  applyDamage,
  autoFailsSave,
  heal,
  saveBonus,
} from '../creature';
import { roll, rollD20, Rng } from '../dice';
import { getSpell } from '../spells/data';
import { aftermath, checkOutcome, dtype, notes } from './helpers';
import { offerDamaged, offerHit } from './reactions';
import { rustOnHit } from './corrosion';
import { applyRiders } from './rider';
import { dropOnAttack } from './rolls';
import { addLog, creatureOf, withCreature } from './state';
import { T, spellT } from '../i18n';

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
    lines.push(
      T(
        `${r.dealt} de dano ${dtype(p.type as DamageType)}${notes(r)}`,
        `${r.dealt} ${dtype(p.type as DamageType)} damage${notes(r)}`,
      ),
    );
  });
  let s = withCreature(state, cur);
  const what = T(
    `${hit.head} — ${hit.crit ? 'ACERTO CRÍTICO' : 'acerto'}`,
    `${hit.head} — ${hit.crit ? 'CRITICAL HIT' : 'hit'}`,
  );
  s = addLog(s, lines.length ? `${what}: ${lines.join(' + ')}.` : `${what}.`, [
    hit.attackerId,
    hit.targetId,
  ]);
  if (dealtTotal > 0) s = aftermath(s, hit.targetId, dealtTotal, rng);
  s = rustOnHit(s, hit.attackerId, hit.targetId, hit.weapon, dealtTotal);
  const r = hit.rider;
  if (r) {
    const spell = getSpell(r.spellId, r.ruleset);
    const caster = creatureOf(s, hit.attackerId);
    if (spell?.damage?.lifesteal && dealtTotal > 0) {
      const back = Math.floor(dealtTotal * spell.damage.lifesteal);
      const who = creatureOf(s, hit.attackerId);
      if (back > 0) {
        s = withCreature(s, heal(who, back));
        s = addLog(s, T(`${who.name} recupera ${back} PV.`, `${who.name} regains ${back} HP.`), [
          who.id,
        ]);
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
        dealtTotal,
      );
  }
  // Corpo Aquecido e afins: quem acerta o monstro (de perto) sofre dano
  const back = allMods(creatureOf(s, hit.targetId)).find(
    (m) => m.retaliate && (!m.retaliate.melee || hit.melee),
  )?.retaliate;
  if (back && creatureOf(s, hit.attackerId).status !== 'dead') {
    const atk = creatureOf(s, hit.attackerId);
    const r = applyDamage(atk, Math.max(0, roll(back.dice, rng).total), { type: back.type });
    s = addLog(
      withCreature(s, r.creature),
      T(
        `${atk.name} sofre ${r.dealt} de dano ${dtype(back.type)} ao acertar ${creatureOf(s, hit.targetId).name}${notes(r)}.`,
        `${atk.name} takes ${r.dealt} ${dtype(back.type)} damage for hitting ${creatureOf(s, hit.targetId).name}${notes(r)}.`,
      ),
      [atk.id, hit.targetId],
    );
    s = aftermath(s, atk.id, r.dealt, rng);
  }
  for (const o of hit.onHit ?? []) s = applyOnHit(s, hit, o, rng);
  s = dropOnAttack(s, hit.attackerId);
  if (dealtTotal > 0 && creatureOf(s, hit.targetId).status !== 'dead')
    s = offerDamaged(s, hit.targetId, hit.attackerId);
  return checkOutcome(s);
}

/** O golpe acertou: ou o alvo pode reagir (Escudo Arcano) e o dano fica suspenso, ou é aplicado já. */
export function holdOrApply(state: EncounterState, hit: HeldHit, rng: Rng): EncounterState {
  return offerHit(state, hit) ?? applyHeldHit(state, hit, rng);
}

/** Golpe marcado (Golpe Aprisionador/Ardente): o alvo faz a salvaguarda; se falhar, leva a condição e o efeito. */
function applyOnHit(
  state: EncounterState,
  hit: HeldHit,
  o: NonNullable<HeldHit['onHit']>[number],
  rng: Rng,
): EncounterState {
  let t = creatureOf(state, hit.targetId);
  if (t.status === 'dead') return state;
  let s = state;
  const spec = o.spec;
  if (spec.save) {
    const auto = autoFailsSave(t, spec.save);
    const r = rollD20(saveBonus(t, spec.save), 'normal', rng);
    const ok = !auto && r.roll.total >= (spec.dc ?? 10);
    s = addLog(
      s,
      T(
        `${t.name}: salvaguarda de ${spec.save.toUpperCase()} contra ${o.spell} — d20 ${r.natural} = ${r.roll.total} vs CD ${spec.dc ?? 10}: ${ok ? 'passou' : 'falhou'}.`,
        `${t.name}: ${spec.save.toUpperCase()} saving throw against ${spellT(o.spell)} — d20 ${r.natural} = ${r.roll.total} vs DC ${spec.dc ?? 10}: ${ok ? 'passed' : 'failed'}.`,
      ),
      [t.id],
    );
    if (ok) {
      if (spec.endsOnSave) {
        const c = creatureOf(s, hit.attackerId);
        if (c.concentration === o.spell) s = withCreature(s, { ...c, concentration: undefined });
      }
      return s;
    }
  }
  if (spec.condition) {
    t = addCondition(creatureOf(s, t.id), spec.condition.name, spec.condition.rounds, {
      spell: o.spell,
      by: o.by,
      ...(o.concentration ? { concentration: true } : {}),
      ...(spec.save && spec.mods?.repeatSave
        ? { repeatSave: { ability: spec.save, dc: spec.dc ?? 10 } }
        : {}),
    });
    s = withCreature(s, t);
    s = addLog(
      s,
      T(
        `${t.name} ficou sob efeito de ${o.spell}.`,
        `${t.name} is under the effect of ${spellT(o.spell)}.`,
      ),
      [t.id],
    );
  }
  if (spec.mods) {
    t = addEffect(creatureOf(s, t.id), {
      id: `${o.by}:${o.spell}:hit`,
      spell: o.spell,
      name: o.spell,
      by: o.by,
      ...(spec.rounds !== undefined ? { rounds: spec.rounds } : {}),
      ...(o.concentration ? { concentration: true } : {}),
      mods: spec.mods.repeatSave
        ? { ...spec.mods, repeatSave: { ability: spec.mods.repeatSave.ability, dc: spec.dc ?? 10 } }
        : spec.mods,
    });
    s = withCreature(s, t);
  }
  return s;
}
