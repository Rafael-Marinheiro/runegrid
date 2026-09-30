import { Creature } from '../../models/creature';
import {
  EncounterState,
  HeldHit,
  PendingReaction,
  PendingSpellReaction,
} from '../../models/encounter';
import { Spell } from '../../models/spell';
import { canAct, hasNoReactions } from '../creature';
import { distanceFt } from '../grid/movement';
import { getSpell } from '../spells/data';
import { addLog, creatureOf, sizeOf, tokenOf } from './state';

/** Pode reagir agora: vivo, capaz, com a reação do turno ainda livre e sem efeito que a impeça. */
export function canReact(state: EncounterState, c: Creature): boolean {
  return (
    state.combat.phase === 'running' &&
    canAct(c) &&
    !hasNoReactions(c) &&
    !(state.combat.reactionUsed ?? []).includes(c.id) &&
    !(state.combat.pending ?? []).some((p) => p.reactorId === c.id)
  );
}

/** Menor nível de espaço livre que serve para a magia, ou `null`. */
export function freeSlotFor(c: Creature, level: number): number | null {
  for (const [lv, s] of Object.entries(c.spellSlots)) {
    if (Number(lv) >= level && s.used < s.max) return Number(lv);
  }
  return null;
}

/** Magias de reação que a criatura conhece para o gatilho `on` e para as quais tem espaço. */
export function reactionSpells(
  c: Creature,
  on: NonNullable<Spell['react']>['on'],
): { spell: Spell; slot: number }[] {
  return (c.spellcasting?.spells ?? []).flatMap((id) => {
    const spell = getSpell(id);
    if (!spell || spell.castTime !== 'reaction' || spell.react?.on !== on) return [];
    const slot = freeSlotFor(c, spell.level);
    return slot === null ? [] : [{ spell, slot }];
  });
}

function nextId(state: EncounterState): number {
  return (state.combat.pending ?? []).reduce((n, p) => Math.max(n, p.id), 0) + 1;
}

function addPending(
  state: EncounterState,
  reactor: Creature,
  targetId: string,
  spell: PendingSpellReaction,
  text: string,
): EncounterState {
  const p: PendingReaction = {
    id: nextId(state),
    kind: 'spell',
    reactorId: reactor.id,
    targetId,
    attackIndex: 0,
    reach: 0,
    spell,
  };
  return addLog(
    { ...state, combat: { ...state.combat, pending: [...(state.combat.pending ?? []), p] } },
    text,
    [reactor.id, targetId],
  );
}

/**
 * Um golpe acertou: se o alvo pode trocar o acerto por erro com uma reação (Escudo Arcano),
 * o dano fica suspenso e o alvo é consultado. Devolve `null` se ninguém reage.
 */
export function offerHit(state: EncounterState, hit: HeldHit): EncounterState | null {
  if (hit.nat20) return null;
  const target = creatureOf(state, hit.targetId);
  if (target.status !== 'alive' || !canReact(state, target)) return null;
  const options = reactionSpells(target, 'hit').filter(
    (o) => o.spell.react?.on === 'hit' && hit.total < hit.ac + o.spell.react.acBonus,
  );
  if (!options.length) return null;
  const attacker = creatureOf(state, hit.attackerId);
  return addPending(
    state,
    target,
    hit.attackerId,
    { trigger: 'hit', hit },
    `${hit.head} — acerto! ${target.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} antes do dano (${attacker.name}).`,
  );
}

/** Quem sofreu dano de `attackerId` pode responder (Repreensão Diabólica). */
export function offerDamaged(
  state: EncounterState,
  targetId: string,
  attackerId: string,
): EncounterState {
  if (targetId === attackerId) return state;
  const target = creatureOf(state, targetId);
  const attacker = creatureOf(state, attackerId);
  if (target.status === 'dead' || attacker.status === 'dead' || !canReact(state, target))
    return state;
  const a = tokenOf(state, attackerId);
  const t = tokenOf(state, targetId);
  if (!a || !t) return state;
  const dist = distanceFt(t.pos, sizeOf(target), a.pos, sizeOf(attacker), state.rule);
  const options = reactionSpells(target, 'damaged').filter((o) => dist <= o.spell.range);
  if (!options.length) return state;
  return addPending(
    state,
    target,
    attackerId,
    { trigger: 'damaged', attackerId },
    `${target.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} contra ${attacker.name}.`,
  );
}

/**
 * Alguém conjura uma magia: criaturas que podem anulá-la (Contrafeitiço) são consultadas e a
 * resolução fica suspensa. Devolve `null` se ninguém reage.
 */
export function offerCast(
  state: EncounterState,
  casterId: string,
  spell: Spell,
  slotLevel: number,
  command: string,
): EncounterState | null {
  const caster = creatureOf(state, casterId);
  const from = tokenOf(state, casterId);
  if (!from) return null;
  let s = state;
  let offered = false;
  for (const t of state.tokens) {
    const r = creatureOf(state, t.creatureId);
    if (r.id === casterId || !canReact(s, r)) continue;
    const options = reactionSpells(r, 'cast').filter(
      (o) => distanceFt(t.pos, sizeOf(r), from.pos, sizeOf(caster), state.rule) <= o.spell.range,
    );
    if (!options.length) continue;
    offered = true;
    s = addPending(
      s,
      r,
      casterId,
      { trigger: 'cast', casterId, spellId: spell.id, slotLevel, command },
      `${r.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} contra ${spell.name}.`,
    );
  }
  return offered ? s : null;
}

/** Há uma magia de reação à espera de decisão? (Trava as ações até alguém decidir.) */
export const hasPendingSpell = (state: EncounterState): PendingReaction | undefined =>
  (state.combat.pending ?? []).find((p) => p.kind === 'spell');
