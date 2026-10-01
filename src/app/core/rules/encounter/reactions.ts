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
import { addLog, creatureOf, sizeOf, teamOf, tokenOf } from './state';
import { T, spellName } from '../i18n';
import { abilitiesOf } from '../monsters/registry';
import { abilitySpent } from './ability';

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
  const own = (c.spellcasting?.spells ?? []).flatMap((id) => {
    const spell = getSpell(id);
    if (!spell || spell.castTime !== 'reaction' || spell.react?.on !== on) return [];
    const slot = freeSlotFor(c, spell.level);
    return slot === null ? [] : [{ spell, slot }];
  });
  // habilidades de monstro que respondem ao gatilho (Aparar, Proteção Mágica…): sem espaço, só recarga/usos
  const abilities = abilitiesOf(c).flatMap((a) => {
    const spell = getSpell(a.id);
    if (!spell || spell.castTime !== 'reaction' || spell.react?.on !== on) return [];
    return abilitySpent(c, a) ? [] : [{ spell, slot: 0 }];
  });
  return [...own, ...abilities];
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
  if (target.status !== 'alive') return null;
  const attacker = creatureOf(state, hit.attackerId);
  const tt = tokenOf(state, target.id);
  let s = state;
  let offered = false;
  for (const reactor of state.creatures) {
    const own = reactor.id === target.id;
    if (!own && (reactor.status !== 'alive' || teamOf(reactor) !== teamOf(target))) continue;
    if (!canReact(s, reactor)) continue;
    const rt = own ? tt : tokenOf(s, reactor.id);
    if (!rt || !tt) continue;
    const dist = distanceFt(rt.pos, sizeOf(reactor), tt.pos, sizeOf(target), state.rule);
    const options = reactionSpells(reactor, 'hit').filter((o) => {
      const r = o.spell.react;
      if (r?.on !== 'hit') return false;
      if (own ? r.ally !== undefined : r.ally === undefined || dist > r.ally) return false;
      if (r.redirect) return redirectAllies(s, reactor).length > 0;
      if (r.reduce) return !hit.melee && hit.parts.some((p) => p.amount > 0);
      return hit.total < hit.ac + r.acBonus && (!r.melee || hit.melee);
    });
    if (!options.length) continue;
    offered = true;
    const names = options.map((o) => o.spell.name).join(' ou ');
    const namesEn = options.map((o) => spellName(o.spell)).join(' or ');
    s = addPending(
      s,
      reactor,
      hit.attackerId,
      { trigger: 'hit', hit },
      own
        ? T(
            `${hit.head} — acerto! ${reactor.name} pode reagir com ${names} antes do dano (${attacker.name}).`,
            `${hit.head} — hit! ${reactor.name} can react with ${namesEn} before damage (${attacker.name}).`,
          )
        : T(
            `${hit.head} — acerto em ${target.name}! ${reactor.name} pode reagir com ${names} antes do dano.`,
            `${hit.head} — hit on ${target.name}! ${reactor.name} can react with ${namesEn} before damage.`,
          ),
    );
  }
  return offered ? s : null;
}

/** Aliados Pequenos ou Médios a até 1,5 m (Redirecionar Ataque): quem pode tomar o lugar do golpeado. */
export function redirectAllies(state: EncounterState, reactor: Creature): Creature[] {
  const rt = tokenOf(state, reactor.id);
  if (!rt) return [];
  return state.creatures.filter((c) => {
    const t = tokenOf(state, c.id);
    return (
      !!t &&
      c.id !== reactor.id &&
      c.status === 'alive' &&
      teamOf(c) === teamOf(reactor) &&
      ['tiny', 'small', 'medium'].includes(c.size) &&
      distanceFt(rt.pos, sizeOf(reactor), t.pos, sizeOf(c), state.rule) <= 5
    );
  });
}

/** Alguém terminou o movimento (`moved`) ou termina o turno (`turnEnd`): reatores por perto são consultados. */
export function offerTrigger(
  state: EncounterState,
  moverId: string,
  on: 'moved' | 'turnEnd' | 'turnStart',
): EncounterState {
  const mover = creatureOf(state, moverId);
  const mt = tokenOf(state, moverId);
  if (!mt || mover.status === 'dead') return state;
  let s = state;
  for (const t of state.tokens) {
    const r = creatureOf(state, t.creatureId);
    if (r.id === moverId || r.status !== 'alive' || !canReact(s, r)) continue;
    if (on === 'moved' && (teamOf(r) === teamOf(mover) || mt.hidden)) continue;
    const dist = distanceFt(t.pos, sizeOf(r), mt.pos, sizeOf(mover), state.rule);
    const options = reactionSpells(r, on).filter((o) => {
      const re = o.spell.react;
      return (
        (re?.on === 'moved' || re?.on === 'turnEnd' || re?.on === 'turnStart') && dist <= re.within
      );
    });
    if (!options.length) continue;
    s = addPending(
      s,
      r,
      moverId,
      { trigger: on, moverId },
      T(
        `${r.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} (${mover.name}).`,
        `${r.name} can react with ${options.map((o) => spellName(o.spell)).join(' or ')} (${mover.name}).`,
      ),
    );
  }
  return s;
}

/** Duas consultas de reação são sobre o mesmo golpe? */
export const sameHit = (a: HeldHit, b: HeldHit): boolean =>
  a.attackerId === b.attackerId && a.targetId === b.targetId && a.head === b.head;

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
    T(
      `${target.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} contra ${attacker.name}.`,
      `${target.name} can react with ${options.map((o) => spellName(o.spell)).join(' or ')} against ${attacker.name}.`,
    ),
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
      T(
        `${r.name} pode reagir com ${options.map((o) => o.spell.name).join(' ou ')} contra ${spell.name}.`,
        `${r.name} can react with ${options.map((o) => spellName(o.spell)).join(' or ')} against ${spellName(spell)}.`,
      ),
    );
  }
  return offered ? s : null;
}

/** Há uma magia de reação à espera de decisão? (Trava as ações até alguém decidir.) */
export const hasPendingSpell = (state: EncounterState): PendingReaction | undefined =>
  (state.combat.pending ?? []).find((p) => p.kind === 'spell');
