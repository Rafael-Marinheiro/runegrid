import { CONDITION_LABEL, Creature, DAMAGE_LABEL, DamageType } from '../../models/creature';
import { EncounterState, Role, TurnState } from '../../models/encounter';
import {
  BonusAction,
  bonusActionsOf,
  canAct,
  checkConcentration,
  removeEffects,
  RuleError,
} from '../creature';
import { AdvMode, Rng } from '../dice';
import { addLog, creatureOf, teamOf, withCreature } from './state';
import { xpForCr } from '../srd/xp';

export interface Context {
  rng: Rng;
  role: Role;
}

/** Dados derivados para a tela final; XP é calculado só pelos inimigos derrotados. */
export function summarizeCombat(state: EncounterState) {
  const participants = state.creatures.filter((c) => state.combat.order.includes(c.id));
  const party = participants.filter((c) => teamOf(c) === 'party');
  const defeatedFoes = participants.filter((c) => teamOf(c) === 'foes' && c.status === 'dead');
  const xp = defeatedFoes.reduce((total, c) => total + xpForCr(c.cr ?? 0), 0);
  return {
    rounds: state.combat.round,
    defeatedFoes,
    survivingParty: party.filter((c) => c.status !== 'dead'),
    fallenParty: party.filter((c) => c.status === 'dead'),
    xp,
    xpPerCharacter: party.length ? Math.floor(xp / party.length) : 0,
  };
}

/** Tipo de dano em português, para o registro. */
export const dtype = (t: DamageType): string => DAMAGE_LABEL[t].toLowerCase();

export const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Texto extra do log quando o dano derruba ou mata. */
export const notes = (r: {
  instantDeath: boolean;
  creature: Creature;
  dropped: boolean;
}): string =>
  r.instantDeath
    ? ' — morte instantânea'
    : r.creature.status === 'dead'
      ? ' — morreu'
      : r.creature.status === 'stable'
        ? ' — nocauteado(a), inconsciente'
        : r.dropped
          ? ' — caiu a 0 PV'
          : '';

/** Termina o combate quando um dos lados não tem mais ninguém vivo. */
export function checkOutcome(state: EncounterState): EncounterState {
  if (state.combat.phase !== 'running') return state;
  const inCombat = state.creatures.filter((c) => state.combat.order.includes(c.id));
  const alive = (team: 'party' | 'foes') =>
    inCombat.some((c) => teamOf(c) === team && c.status !== 'dead');
  const outcome = !alive('foes') ? 'party' : !alive('party') ? 'foes' : undefined;
  if (!outcome) return state;
  return addLog(
    { ...state, combat: { ...state.combat, phase: 'ended', turn: null, outcome } },
    outcome === 'party'
      ? 'Fim do combate: o grupo venceu.'
      : 'Fim do combate: o grupo foi derrotado.',
  );
}

/** Valida que `actorId` está na vez (e no estado exigido) e devolve a criatura e o orçamento do turno. */
export function actorTurn(
  state: EncounterState,
  actorId: string,
  need: 'alive' | 'dying' | 'any' = 'alive',
) {
  const actor = creatureOf(state, actorId);
  const turn = state.combat.turn;
  if (state.combat.phase !== 'running' || !turn)
    throw new RuleError('O combate não está em andamento.');
  if (turn.actorId !== actorId) throw new RuleError(`Não é a vez de ${actor.name}.`);
  const waiting = (state.combat.pending ?? []).find((p) => p.kind === 'spell');
  if (waiting)
    throw new RuleError(
      `Aguardando a reação de ${creatureOf(state, waiting.reactorId).name}: use ou recuse.`,
    );
  if (need === 'alive' && !canAct(actor)) throw new RuleError(`${actor.name} não pode agir agora.`);
  if (need === 'dying' && actor.status !== 'dying')
    throw new RuleError(`${actor.name} não está morrendo.`);
  return { actor, turn };
}

export const setTurn = (state: EncounterState, turn: TurnState): EncounterState => ({
  ...state,
  combat: { ...state.combat, turn },
});

/**
 * Gasta a ação — ou, com `bonus`, a ação bônus que uma característica concede (Ação Astuta,
 * Fuga Ágil). Devolve qual campo do turno foi gasto.
 */
export function spendCost(
  actor: Creature,
  turn: TurnState,
  what: BonusAction,
  bonus = false,
): 'action' | 'bonus' {
  if (!bonus) {
    spendAction(turn);
    return 'action';
  }
  if (!bonusActionsOf(actor).includes(what))
    throw new RuleError(`${actor.name} não pode fazer isso como ação bônus.`);
  if (!turn.bonus) throw new RuleError('Sem ação bônus disponível neste turno.');
  return 'bonus';
}

export function spendAction(turn: TurnState): void {
  if (!turn.action) throw new RuleError('Sem ação disponível neste turno.');
}

/** Vantagem e desvantagem se anulam; não se acumulam. */
export function combineModes(modes: AdvMode[]): AdvMode {
  const adv = modes.includes('advantage');
  const dis = modes.includes('disadvantage');
  return adv && !dis ? 'advantage' : dis && !adv ? 'disadvantage' : 'normal';
}

/** Depois do dano: quem mantém concentração faz salvaguarda de Constituição; cair a 0 PV encerra. */
export function aftermath(
  state: EncounterState,
  targetId: string,
  dealt: number,
  rng: Rng,
): EncounterState {
  let t = creatureOf(state, targetId);
  if (dealt > 0 && t.conditions.some((c) => c.endsOnDamage)) {
    const woke = t.conditions.filter((c) => c.endsOnDamage);
    t = { ...t, conditions: t.conditions.filter((c) => !c.endsOnDamage) };
    state = addLog(
      withCreature(state, t),
      `${t.name} acorda: ${woke.map((c) => c.spell ?? CONDITION_LABEL[c.name]).join(', ')} termina.`,
      [t.id],
    );
  }
  if (dealt > 0 && (t.effects ?? []).some((e) => e.endsOnDamage)) {
    const woke = (t.effects ?? []).filter((e) => e.endsOnDamage);
    t = removeEffects(t, (e) => woke.includes(e));
    state = addLog(
      withCreature(state, t),
      `${t.name}: ${woke.map((e) => e.name).join(', ')} termina.`,
      [t.id],
    );
  }
  if (!t.concentration) return state;
  if (t.status !== 'alive') {
    return addLog(
      withCreature(state, { ...t, concentration: undefined }),
      `${t.name} perde a concentração em ${t.concentration}.`,
      [t.id],
    );
  }
  const chk = checkConcentration(t, dealt, rng);
  if (!chk) return state;
  const text = `${t.name}: concentração em ${t.concentration} — d20 ${chk.roll} = ${chk.total} vs CD ${chk.dc}: ${chk.broken ? 'perdida' : 'mantida'}.`;
  return addLog(withCreature(state, chk.creature), text, [t.id]);
}
