import { CONDITION_LABEL } from '../../models/creature';
import { EncounterState, Zone } from '../../models/encounter';
import { Pos } from '../../models/grid';
import {
  addTempHp,
  allMods,
  applyDamage,
  autoFailsSave,
  endCasterExpiry,
  heal,
  removeEffects,
  saveBonus,
  startTurnExpiry,
  tickEffects,
} from '../creature';
import { rollD20, roll } from '../dice';
import { getSpell } from '../spells/data';
import { resolveSpell } from './cast';
import { aftermath, checkOutcome, Context, dtype, notes } from './helpers';
import { addLog, creatureOf, tokenOf, withCreature } from './state';
import { zoneContains } from './zones';
import { abilitiesAtTurnStart } from './ability';
import { abilitiesOf, monsterEntry } from '../monsters/registry';
import { T, condT, spellT } from '../i18n';
import { guardBites, tickSummons } from './summon';
import { inRunningWater, isSunlit } from './environment';

/**
 * Tudo que dura só enquanto o conjurador mantém a concentração some junto com ela: efeitos,
 * condições, magias mantidas e áreas. Roda no fim de cada comando.
 */
export function syncConcentration(state: EncounterState): EncounterState {
  const holding = (casterId: string, name: string): boolean => {
    const c = state.creatures.find((x) => x.id === casterId);
    return !!c && c.status !== 'dead' && c.concentration === name;
  };
  const dropped = new Map<string, string>();
  let changed = false;
  const creatures = state.creatures.map((c) => {
    let next = c;
    const gone = (next.effects ?? []).filter((e) => e.concentration && !holding(e.by, e.name));
    if (gone.length) {
      next = removeEffects(next, (e) => gone.includes(e));
      for (const e of gone) dropped.set(`${e.by}:${e.name}`, e.name);
    }
    const conds = next.conditions.filter(
      (k) => k.concentration && k.by && k.spell && !holding(k.by, k.spell),
    );
    if (conds.length) {
      next = { ...next, conditions: next.conditions.filter((k) => !conds.includes(k)) };
      for (const k of conds) dropped.set(`${k.by}:${k.spell}`, k.spell!);
    }
    const kept = (next.sustained ?? []).filter((x) => {
      const sp = getSpell(x.spellId);
      return !(
        sp?.concentration && !(x.by ? holding(x.by, sp.name) : next.concentration === sp.name)
      );
    });
    if (kept.length !== (next.sustained ?? []).length)
      next = { ...next, sustained: kept.length ? kept : undefined };
    if (next !== c) changed = true;
    return next;
  });
  const zones = (state.zones ?? []).filter((z) => !z.concentration || holding(z.casterId, z.name));
  const zonesChanged = zones.length !== (state.zones ?? []).length;
  if (!changed && !zonesChanged) return state;
  let s: EncounterState = { ...state, creatures, ...(state.zones ? { zones } : {}) };
  for (const z of (state.zones ?? []).filter((x) => !zones.includes(x)))
    dropped.set(`${z.casterId}:${z.name}`, z.name);
  for (const name of new Set(dropped.values()))
    s = addLog(s, T(`${name} termina.`, `${spellT(name)} ends.`));
  return s;
}

/** Aplica de novo o efeito da magia de uma zona a uma criatura dentro dela. */
function triggerZone(
  state: EncounterState,
  zone: Zone,
  creatureId: string,
  ctx: Context,
): EncounterState {
  const spell = getSpell(zone.spellId, zone.ruleset);
  const caster = state.creatures.find((c) => c.id === zone.casterId);
  if (!spell || !caster || caster.status === 'dead') return state;
  const target = creatureOf(state, creatureId);
  const tick = { ...spell, effect: spell.effect?.to === 'self' ? undefined : spell.effect };
  const s = addLog(
    state,
    T(`${target.name} está em ${zone.name}.`, `${target.name} is in ${spellT(zone.name)}.`),
    [creatureId],
  );
  return resolveSpell(
    s,
    caster,
    tick,
    zone.slotLevel,
    [target],
    0,
    ctx,
    { point: zone.center },
    'tick',
  );
}

/** Começa o turno de `actorId`: efeitos que acabam, regeneração, dano contínuo e zonas. */
export function beginUpkeep(state: EncounterState, actorId: string, ctx: Context): EncounterState {
  let s = abilitiesAtTurnStart(state, actorId, ctx.rng, abilitiesOf(creatureOf(state, actorId)));
  const ex = startTurnExpiry(s.creatures, actorId);
  s = { ...s, creatures: ex.creatures };
  for (const { holder, effect } of ex.expired)
    s = addLog(
      s,
      T(`${holder.name}: ${effect.name} termina.`, `${holder.name}: ${spellT(effect.name)} ends.`),
      [holder.id],
    );

  s = guardBites(s, actorId, ctx);
  // luz do sol: Fraqueza do Vampiro (20 radiante no início do turno)
  for (const m of allMods(creatureOf(s, actorId))) {
    if (
      !m.sunDamage ||
      !isSunlit(s, creatureOf(s, actorId)) ||
      creatureOf(s, actorId).status === 'dead'
    )
      continue;
    s = dealDot(s, actorId, m.sunDamage, T('luz do sol', 'sunlight'), ctx);
  }
  const actor = creatureOf(s, actorId);
  // Regeneração dos monstros (traço): suspensa por certos tipos de dano até este turno
  for (const tr of monsterEntry(actor.srdId)?.traits ?? []) {
    if (!tr.mods.regen || actor.status !== 'alive') continue;
    const noShade =
      allMods(actor).some((m) => m.regenNeedsShade) &&
      (isSunlit(s, actor) || inRunningWater(s, actor));
    if (actor.regenBlocked || noShade)
      s = addLog(
        s,
        T(
          `${actor.name} não regenera neste turno (${tr.name}).`,
          `${actor.name} does not regenerate this turn (${tr.nameEn}).`,
        ),
        [actorId],
      );
    else {
      const before = creatureOf(s, actorId);
      const after = heal(before, tr.mods.regen);
      s = withCreature(s, after);
      if (after.hp.current !== before.hp.current)
        s = addLog(
          s,
          T(
            `${actor.name} regenera ${after.hp.current - before.hp.current} PV (${tr.name}).`,
            `${actor.name} regenerates ${after.hp.current - before.hp.current} HP (${tr.nameEn}).`,
          ),
          [actorId],
        );
    }
  }
  if (actor.regenBlocked)
    s = withCreature(s, { ...creatureOf(s, actorId), regenBlocked: undefined });
  for (const e of actor.effects ?? []) {
    const m = e.mods;
    if (m.regen && actor.status === 'alive') {
      s = withCreature(s, heal(creatureOf(s, actorId), m.regen));
      s = addLog(
        s,
        T(
          `${actor.name} recupera ${m.regen} PV (${e.name}).`,
          `${actor.name} regains ${m.regen} HP (${spellT(e.name)}).`,
        ),
        [actorId],
      );
    }
    if (m.tempPerTurn) {
      s = withCreature(s, addTempHp(creatureOf(s, actorId), m.tempPerTurn));
      s = addLog(
        s,
        T(
          `${actor.name} ganha ${m.tempPerTurn} PV temporários (${e.name}).`,
          `${actor.name} gains ${m.tempPerTurn} temporary HP (${spellT(e.name)}).`,
        ),
        [actorId],
      );
    }
    if (m.dotStart) s = dealDot(s, actorId, m.dotStart, e.name, ctx);
  }

  for (const z of s.zones ?? []) {
    if ((z.on === 'start' || z.on === 'both') && zoneContains(s, z, actorId))
      s = triggerZone(s, z, actorId, ctx);
  }
  return s;
}

function dealDot(
  state: EncounterState,
  id: string,
  dot: { dice: string; type: Parameters<typeof dtype>[0] },
  name: string,
  ctx: Context,
): EncounterState {
  const c = creatureOf(state, id);
  if (c.status === 'dead') return state;
  const r = applyDamage(c, Math.max(0, roll(dot.dice, ctx.rng).total), { type: dot.type });
  const s = addLog(
    withCreature(state, r.creature),
    T(
      `${c.name} sofre ${r.dealt} de dano ${dtype(dot.type)} (${name})${notes(r)}.`,
      `${c.name} takes ${r.dealt} ${dtype(dot.type)} damage (${spellT(name)})${notes(r)}.`,
    ),
    [id],
  );
  return checkOutcome(aftermath(s, id, r.dealt, ctx.rng));
}

/** Fim do turno de `actorId`: dano contínuo, salvaguardas repetidas, durações e magias mantidas. */
export function endUpkeep(state: EncounterState, actorId: string, ctx: Context): EncounterState {
  let s = state;
  const actor = creatureOf(s, actorId);

  for (const e of actor.effects ?? []) {
    if (e.mods.dotEnd) s = dealDot(s, actorId, e.mods.dotEnd, e.name, ctx);
  }
  // água corrente: Fraqueza do Vampiro (20 ácido ao terminar o turno)
  for (const m of allMods(creatureOf(s, actorId))) {
    if (
      !m.waterDamage ||
      !inRunningWater(s, creatureOf(s, actorId)) ||
      creatureOf(s, actorId).status === 'dead'
    )
      continue;
    s = dealDot(s, actorId, m.waterDamage, T('água corrente', 'running water'), ctx);
  }

  // salvaguardas repetidas: passar encerra a condição ou o efeito
  let cur = creatureOf(s, actorId);
  if (cur.status !== 'dead') {
    const seen = new Set<string>();
    for (const k of cur.conditions.filter((x) => x.repeatSave)) {
      // uma salvaguarda por magia, mesmo que ela imponha mais de uma condição
      const key = `${k.by}:${k.spell ?? k.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rs = k.repeatSave!;
      const auto = autoFailsSave(cur, rs.ability);
      const r = rollD20(saveBonus(cur, rs.ability), 'normal', ctx.rng);
      const ok = !auto && r.roll.total >= rs.dc;
      s = addLog(
        s,
        T(
          `${cur.name}: salvaguarda de ${rs.ability.toUpperCase()} contra ${k.spell ?? CONDITION_LABEL[k.name]} — d20 ${r.natural} = ${r.roll.total} vs CD ${rs.dc}: ${ok ? 'passou, termina' : 'falhou'}.`,
          `${cur.name}: ${rs.ability.toUpperCase()} saving throw against ${k.spell ? spellT(k.spell) : condT(k.name)} — d20 ${r.natural} = ${r.roll.total} vs DC ${rs.dc}: ${ok ? 'passed, it ends' : 'failed'}.`,
        ),
        [cur.id],
      );
      if (ok) {
        cur = creatureOf(s, actorId);
        const same = (x: typeof k) => `${x.by}:${x.spell ?? x.name}` === key;
        cur = removeEffects(
          { ...cur, conditions: cur.conditions.filter((x) => !same(x)) },
          (e) => `${e.by}:${e.name}` === key,
        );
        s = withCreature(s, cur);
      }
    }
    for (const e of cur.effects ?? []) {
      const rs = e.mods.repeatSave;
      if (!rs) continue;
      const r = rollD20(saveBonus(cur, rs.ability), 'normal', ctx.rng);
      const ok = r.roll.total >= rs.dc;
      s = addLog(
        s,
        T(
          `${cur.name}: salvaguarda de ${rs.ability.toUpperCase()} contra ${e.name} — d20 ${r.natural} = ${r.roll.total} vs CD ${rs.dc}: ${ok ? 'passou, termina' : 'falhou'}.`,
          `${cur.name}: ${rs.ability.toUpperCase()} saving throw against ${spellT(e.name)} — d20 ${r.natural} = ${r.roll.total} vs DC ${rs.dc}: ${ok ? 'passed, it ends' : 'failed'}.`,
        ),
        [cur.id],
      );
      if (ok) {
        cur = removeEffects(
          {
            ...creatureOf(s, actorId),
            conditions: creatureOf(s, actorId).conditions.filter(
              (k) => !(k.spell === e.name && k.by === e.by),
            ),
          },
          (x) => x.id === e.id,
        );
        s = withCreature(s, cur);
      }
    }
  }

  const t = tickEffects(creatureOf(s, actorId));
  s = withCreature(s, t.creature);
  for (const e of t.expired)
    s = addLog(
      s,
      T(`${actor.name}: ${e.name} termina.`, `${actor.name}: ${spellT(e.name)} ends.`),
      [actorId],
    );

  const ce = endCasterExpiry(s.creatures, actorId);
  s = { ...s, creatures: ce.creatures };
  for (const { holder, effect } of ce.expired)
    s = addLog(
      s,
      T(`${holder.name}: ${effect.name} termina.`, `${holder.name}: ${spellT(effect.name)} ends.`),
      [holder.id],
    );

  // magias mantidas sem concentração (Arma Espiritual) duram um número de rodadas
  const me = creatureOf(s, actorId);
  if (me.sustained?.some((x) => x.rounds !== undefined)) {
    const ended: string[] = [];
    const sustained = me.sustained.flatMap((x) => {
      if (x.rounds === undefined) return [x];
      if (x.rounds <= 1) {
        ended.push(getSpell(x.spellId)?.name ?? x.spellId);
        return [];
      }
      return [{ ...x, rounds: x.rounds - 1 }];
    });
    s = withCreature(s, { ...me, sustained: sustained.length ? sustained : undefined });
    for (const n of ended) s = addLog(s, T(`${n} termina.`, `${spellT(n)} ends.`), [actorId]);
  }
  return tickSummons(s, actorId, ctx);
}

/** Virou a rodada: as zonas gastam uma rodada de duração. */
export function tickZones(state: EncounterState): EncounterState {
  if (!state.zones?.length) return state;
  const ended: Zone[] = [];
  const zones = state.zones.flatMap((z) => {
    if (z.rounds === undefined) return [z];
    if (z.rounds <= 1) {
      ended.push(z);
      return [];
    }
    return [{ ...z, rounds: z.rounds - 1 }];
  });
  let s: EncounterState = { ...state, zones };
  for (const z of ended) s = addLog(s, T(`${z.name} termina.`, `${spellT(z.name)} ends.`));
  return s;
}

/** Depois de mover: entrar numa zona (Raio de Lua, Crescer Espinhos) aplica o efeito. */
export function enterZones(
  state: EncounterState,
  moverId: string,
  from: Pos,
  ctx: Context,
): EncounterState {
  let s = state;
  const at = tokenOf(s, moverId);
  if (!at) return s;
  for (const z of s.zones ?? []) {
    if (z.on !== 'enter' && z.on !== 'both') continue;
    const now = zoneContains(s, z, moverId);
    if (!now) continue;
    const back = {
      ...s,
      tokens: s.tokens.map((t) => (t.creatureId === moverId ? { ...t, pos: from } : t)),
    };
    if (zoneContains(back, z, moverId)) continue;
    s = triggerZone(s, z, moverId, ctx);
  }
  return s;
}
