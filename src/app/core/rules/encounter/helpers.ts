import { Creature, DAMAGE_LABEL, DamageType } from '../../models/creature';
import { EncounterState, Role, TurnState } from '../../models/encounter';
import { canAct, checkConcentration, RuleError } from '../creature';
import { AdvMode, Rng } from '../dice';
import { addLog, creatureOf, teamOf, withCreature } from './state';

export interface Context {
  rng: Rng;
  role: Role;
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
  if (need === 'alive' && !canAct(actor)) throw new RuleError(`${actor.name} não pode agir agora.`);
  if (need === 'dying' && actor.status !== 'dying')
    throw new RuleError(`${actor.name} não está morrendo.`);
  return { actor, turn };
}

export const setTurn = (state: EncounterState, turn: TurnState): EncounterState => ({
  ...state,
  combat: { ...state.combat, turn },
});

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
  const t = creatureOf(state, targetId);
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
