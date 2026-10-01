import { Creature } from '../../models/creature';
import { EncounterState, PendingReaction } from '../../models/encounter';
import { Spell } from '../../models/spell';
import {
  abilityMod,
  canAct,
  effectiveAc,
  proficiencyBonus,
  restoreSlot,
  RuleError,
  saveBonus,
  spendSlot,
} from '../creature';
import { rollD20 } from '../dice';
import { distanceFt } from '../grid/movement';
import { getSpell } from '../spells/data';
import { affectedBy, finishCast, resolveSpell } from './cast';
import { Command } from './commands';
import { attachFx, spellFx } from './fx';
import { Context } from './helpers';
import { manualT, spellName, T } from '../i18n';
import { applyHeldHit } from './hits';
import { canReact, freeSlotFor } from './reactions';
import { dropOnAttack } from './rolls';
import { addLog, creatureOf, sizeOf, tokenOf, withCreature } from './state';
import { distT } from '../units';
import { isRaging } from './rage';

type ReactionCmd = Extract<Command, { type: 'reaction' }>;

const LEVEL = (n: number) => T(`${n}º nível`, `level ${n}`);

/** Gasta o espaço e a reação, registra a conjuração e devolve o conjurador já atualizado. */
function payReaction(
  state: EncounterState,
  reactor: Creature,
  spell: Spell,
  slot: number,
): { state: EncounterState; reactor: Creature } {
  const paid = slot > 0 ? spendSlot(reactor, slot) : reactor;
  let s = withCreature(state, paid);
  s = {
    ...s,
    combat: { ...s.combat, reactionUsed: [...(s.combat.reactionUsed ?? []), reactor.id] },
  };
  const up = slot > spell.level ? ` (${LEVEL(slot)})` : '';
  s = addLog(
    s,
    T(
      `${reactor.name} usa a reação: ${spellName(spell)}${up}.`,
      `${reactor.name} uses a reaction: ${spellName(spell)}${up}.`,
    ),
    [reactor.id],
  );
  return { state: s, reactor: paid };
}

function pickSpell(reactor: Creature, cmd: ReactionCmd): { spell: Spell; slot: number } {
  const spell = cmd.spellId ? getSpell(cmd.spellId, cmd.ruleset) : undefined;
  if (!spell || !reactor.spellcasting?.spells.includes(spell.id))
    throw new RuleError(
      T(`${reactor.name} não conhece essa magia.`, `${reactor.name} does not know that spell.`),
    );
  if (spell.castTime !== 'reaction')
    throw new RuleError(
      T(`${spell.name} não é uma magia de reação.`, `${spellName(spell)} is not a reaction spell.`),
    );
  if (isRaging(reactor))
    throw new RuleError(
      T('Não se conjura durante a fúria.', 'Spells cannot be cast while raging.'),
    );
  const slot = cmd.slotLevel ?? freeSlotFor(reactor, spell.level);
  if (slot === null || slot === undefined || slot < spell.level || slot > 9)
    throw new RuleError(T('Sem espaço de magia para reagir.', 'No spell slot to react with.'));
  const pool = reactor.spellSlots[slot];
  if (!pool || pool.used >= pool.max)
    throw new RuleError(
      T(`Sem espaço de magia de ${slot}º nível.`, `No level ${slot} spell slot left.`),
    );
  return { spell, slot };
}

/** Reação de magia à espera de decisão: usa (ou recusa) Escudo Arcano, Repreensão Diabólica, Contrafeitiço. */
export function spellReaction(
  state: EncounterState,
  cmd: ReactionCmd,
  pend: PendingReaction,
  ctx: Context,
): EncounterState {
  const info = pend.spell!;
  const reactor = creatureOf(state, cmd.actorId);
  const rest = {
    ...state,
    combat: { ...state.combat, pending: (state.combat.pending ?? []).filter((x) => x !== pend) },
  };

  if (!cmd.use) {
    const s = addLog(rest, T(`${reactor.name} não reage.`, `${reactor.name} does not react.`), [
      reactor.id,
    ]);
    if (info.trigger === 'hit') return applyHeldHit(s, info.hit, ctx.rng);
    if (info.trigger === 'cast') return resumeCast(s, info.command, ctx);
    return s;
  }

  if (!canReact({ ...rest, combat: { ...rest.combat, pending: [] } }, reactor))
    throw new RuleError(
      T(`${reactor.name} não pode reagir agora.`, `${reactor.name} cannot react now.`),
    );
  const { spell, slot } = pickSpell(reactor, cmd);
  if (spell.react?.on !== info.trigger)
    throw new RuleError(
      T(`${spell.name} não responde a isso.`, `${spellName(spell)} does not respond to that.`),
    );
  const paid = payReaction(rest, reactor, spell, slot);
  let s = paid.state;
  const who = paid.reactor;

  if (info.trigger === 'hit') {
    const before = effectiveAc(who);
    const fx = spellFx(s, spell, slot, who.id, [who.id]);
    s = attachFx(state, s, fx);
    s = resolveSpell(s, who, spell, slot, [who], 0, ctx, { ruleset: cmd.ruleset });
    const newAc = info.hit.ac + (effectiveAc(creatureOf(s, who.id)) - before);
    if (info.hit.total >= newAc) return applyHeldHit(s, info.hit, ctx.rng);
    s = addLog(
      s,
      T(
        `${info.hit.head} — erro (${spellName(spell)}).`,
        `${info.hit.head} — miss (${spellName(spell)}).`,
      ),
      [info.hit.attackerId, who.id],
    );
    return dropOnAttack(s, info.hit.attackerId);
  }

  if (info.trigger === 'damaged') {
    const attacker = creatureOf(s, info.attackerId);
    const a = tokenOf(s, attacker.id);
    const r = tokenOf(s, who.id);
    if (!a || !r || attacker.status === 'dead') return s;
    const dist = distanceFt(r.pos, sizeOf(who), a.pos, sizeOf(attacker), s.rule);
    if (dist > spell.range)
      throw new RuleError(
        T(
          `Alvo fora de alcance (${distT(dist)}; alcance ${distT(spell.range)}).`,
          `Target out of range (${distT(dist)}; range ${distT(spell.range)}).`,
        ),
      );
    const before = s;
    s = attachFx(before, s, spellFx(s, spell, slot, who.id, [attacker.id]));
    return resolveSpell(s, who, spell, slot, [attacker], dist, ctx, { ruleset: cmd.ruleset });
  }

  // contrafeitiço: anula a magia de nível igual ou menor; senão, teste de atributo CD 10 + nível
  const target = JSON.parse(info.command) as Extract<Command, { type: 'cast' }>;
  const other = getSpell(info.spellId, target.ruleset);
  const theirLevel = info.slotLevel;
  let countered = slot >= theirLevel;
  let text = '';
  if (spell.react?.on === 'cast' && spell.react.save) {
    // 2024: o conjurador faz salvaguarda de Constituição; se falhar, a magia se dissipa e o espaço não é gasto
    const victim = creatureOf(s, info.casterId);
    const dc =
      8 + proficiencyBonus(who) + abilityMod(who.abilities[who.spellcasting?.ability ?? 'int']);
    const r = rollD20(saveBonus(victim, 'con'), 'normal', ctx.rng);
    countered = r.roll.total < dc;
    text = T(
      ` (Constituição de ${victim.name}: d20 ${r.natural} = ${r.roll.total} vs CD ${dc})`,
      ` (${victim.name}'s Constitution: d20 ${r.natural} = ${r.roll.total} vs DC ${dc})`,
    );
    if (countered && theirLevel > 0) s = withCreature(s, restoreSlot(victim, theirLevel));
  } else if (!countered) {
    const mod = abilityMod(who.abilities[who.spellcasting?.ability ?? 'int']);
    const r = rollD20(mod, 'normal', ctx.rng);
    countered = r.roll.total >= 10 + theirLevel;
    text = T(
      ` (teste d20 ${r.natural} ${mod >= 0 ? '+' : ''}${mod} = ${r.roll.total} vs CD ${10 + theirLevel})`,
      ` (check d20 ${r.natural} ${mod >= 0 ? '+' : ''}${mod} = ${r.roll.total} vs DC ${10 + theirLevel})`,
    );
  }
  if (countered) {
    const caster = creatureOf(s, info.casterId);
    s = addLog(
      s,
      T(
        `${spellName(spell)}: ${caster.name} perde ${other ? spellName(other) : 'a magia'}${text}.`,
        `${spellName(spell)}: ${caster.name} loses ${other ? spellName(other) : 'the spell'}${text}.`,
      ),
      [who.id, caster.id],
    );
    // outras reações à mesma conjuração deixam de fazer sentido
    return {
      ...s,
      combat: {
        ...s.combat,
        pending: (s.combat.pending ?? []).filter(
          (x) => !(x.spell?.trigger === 'cast' && x.spell.command === info.command),
        ),
      },
    };
  }
  s = addLog(s, T(`${spellName(spell)} falha${text}.`, `${spellName(spell)} fails${text}.`), [
    who.id,
  ]);
  return resumeCast(s, info.command, ctx);
}

/** A conjuração suspensa segue em frente quando ninguém mais pode anulá-la. */
function resumeCast(state: EncounterState, command: string, ctx: Context): EncounterState {
  const waiting = (state.combat.pending ?? []).some(
    (x) => x.spell?.trigger === 'cast' && x.spell.command === command,
  );
  if (waiting) return state;
  return finishCast(state, JSON.parse(command) as Extract<Command, { type: 'cast' }>, ctx);
}

/** Reação avulsa (sem gatilho do motor): Queda Suave. Qualquer hora, gasta a reação. */
export function freeReaction(
  state: EncounterState,
  cmd: ReactionCmd,
  ctx: Context,
): EncounterState {
  const reactor = creatureOf(state, cmd.actorId);
  if (!canAct(reactor))
    throw new RuleError(
      T(`${reactor.name} não pode reagir agora.`, `${reactor.name} cannot react now.`),
    );
  if ((state.combat.reactionUsed ?? []).includes(reactor.id))
    throw new RuleError(
      T(`${reactor.name} já usou a reação.`, `${reactor.name} already used their reaction.`),
    );
  const { spell, slot } = pickSpell(reactor, cmd);
  if (spell.react)
    throw new RuleError(
      T(
        `${spell.name} só responde ao gatilho dela.`,
        `${spellName(spell)} only responds to its own trigger.`,
      ),
    );
  const { creatures: targets, dist } = affectedBy(state, spell, reactor, cmd, slot, ctx.role);
  const paid = payReaction(state, reactor, spell, slot);
  const s = attachFx(
    state,
    paid.state,
    spellFx(
      paid.state,
      spell,
      slot,
      reactor.id,
      targets.map((t) => t.id),
      cmd.point,
    ),
  );
  if (spell.narrative || spell.manual)
    return addLog(
      resolveSpell(s, paid.reactor, spell, slot, targets, dist, ctx, cmd),
      spell.narrative
        ? T(
            `${spellName(spell)}: efeito narrativo, o Mestre conduz.`,
            `${spellName(spell)}: narrative effect, the GM runs it.`,
          )
        : `${spellName(spell)}: ${manualT(spell)}`,
      [reactor.id],
    );
  return resolveSpell(s, paid.reactor, spell, slot, targets, dist, ctx, cmd);
}
