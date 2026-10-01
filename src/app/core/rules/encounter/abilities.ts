/**
 * Habilidades de classe (F12, fase 4): Retomar o Fôlego e Surto de Ação (guerreiro), Fúria
 * (bárbaro) e Ataque Furtivo (ladino), sobre `Creature.features` e os recursos da ficha.
 */
import { Creature } from '../../models/creature';
import { ActiveEffect } from '../../models/effect';
import { EncounterState, TurnState } from '../../models/encounter';
import {
  addEffect,
  canAct,
  effectsOf,
  FEATURE_RESOURCE,
  heal,
  LimitedFeature,
  rageDamage,
  removeEffects,
  RuleError,
  sneakAttackDice,
  spendResource,
  withFeatureResource,
} from '../creature';
import { roll, Rng } from '../dice';
import { distanceFt } from '../grid/movement';
import { T } from '../i18n';
import { Command } from './commands';
import { attachFx, centerOf } from './fx';
import { actorTurn, setTurn } from './helpers';
import { addLog, creatureOf, sizeOf, teamOf, tokenOf, withCreature } from './state';

type FeatureCmd = Extract<Command, { type: 'feature' }>;

/** Usa uma habilidade de classe do turno (comando `feature`). */
export function useFeature(state: EncounterState, cmd: FeatureCmd, rng: Rng): EncounterState {
  const { actor, turn } = actorTurn(state, cmd.actorId);
  if (!(actor.features ?? []).includes(cmd.feature))
    throw new RuleError(
      T(`${actor.name} não tem essa habilidade.`, `${actor.name} does not have that feature.`),
    );
  switch (cmd.feature) {
    case 'second-wind':
      return secondWind(state, actor, turn, rng);
    case 'action-surge':
      return actionSurge(state, actor, turn);
    case 'rage':
      return rage(state, actor, turn);
    default:
      throw new RuleError(T('Habilidade sem uso ativo.', 'This feature has no active use.'));
  }
}

function spend(actor: Creature, id: LimitedFeature): Creature {
  return spendResource(withFeatureResource(actor, id), FEATURE_RESOURCE[id].name);
}

function secondWind(
  state: EncounterState,
  actor: Creature,
  turn: TurnState,
  rng: Rng,
): EncounterState {
  if (!turn.bonus)
    throw new RuleError(
      T('Sem ação bônus disponível neste turno.', 'No bonus action left this turn.'),
    );
  const paid = spend(actor, 'second-wind');
  const n = Math.max(1, roll('1d10', rng).total + Math.max(1, actor.level));
  const healed = heal(paid, n);
  const gained = healed.hp.current - actor.hp.current;
  const s = addLog(
    setTurn(withCreature(state, healed), { ...turn, bonus: false }),
    T(
      `${actor.name} retoma o fôlego: recupera ${gained} PV.`,
      `${actor.name} catches their breath: regains ${gained} HP.`,
    ),
    [actor.id],
  );
  const at = centerOf(state, actor.id);
  return attachFx(state, s, at ? [{ kind: 'glow', at, color: 'life' }] : []);
}

function actionSurge(state: EncounterState, actor: Creature, turn: TurnState): EncounterState {
  if (actor.level < 2)
    throw new RuleError(T('O Surto de Ação vem no 2º nível.', 'Action Surge comes at 2nd level.'));
  if (turn.surged)
    throw new RuleError(
      T('O Surto de Ação já foi usado neste turno.', 'Action Surge was already used this turn.'),
    );
  const paid = spend(actor, 'action-surge');
  const s = addLog(
    setTurn(withCreature(state, paid), { ...turn, action: true, surged: true }),
    T(
      `${actor.name} usa o Surto de Ação: ganha uma ação extra.`,
      `${actor.name} uses Action Surge: gains an extra action.`,
    ),
    [actor.id],
  );
  const at = centerOf(state, actor.id);
  return attachFx(state, s, at ? [{ kind: 'glow', at, color: 'fire' }] : []);
}

function rage(state: EncounterState, actor: Creature, turn: TurnState): EncounterState {
  const id = `${actor.id}:rage`;
  // usar de novo com a fúria ativa a encerra, sem custo
  if (effectsOf(actor).some((e) => e.id === id)) {
    return addLog(
      withCreature(
        state,
        removeEffects(actor, (e) => e.id === id),
      ),
      T(`${actor.name} acalma a fúria.`, `${actor.name} calms their rage.`),
      [actor.id],
    );
  }
  if (!turn.bonus)
    throw new RuleError(
      T('Sem ação bônus disponível neste turno.', 'No bonus action left this turn.'),
    );
  const paid = spend(actor, 'rage');
  const bonus = rageDamage(actor.level);
  const effect: ActiveEffect = {
    id,
    spell: 'rage',
    name: 'Fúria',
    by: actor.id,
    rounds: 10,
    kept: true,
    mods: {
      rage: true,
      meleeDamage: bonus,
      resist: ['bludgeoning', 'piercing', 'slashing'],
      note: 'Vantagem em testes e salvaguardas de Força; sem magias nem concentração. Acaba se o turno passar sem atacar ou sofrer dano.',
      noteEn:
        'Advantage on Strength checks and saves; no spells or concentration. Ends if a turn passes without attacking or taking damage.',
    },
  };
  const dropped = paid.concentration;
  let s = setTurn(withCreature(state, addEffect({ ...paid, concentration: undefined }, effect)), {
    ...turn,
    bonus: false,
  });
  s = addLog(
    s,
    T(
      `${actor.name} entra em fúria: resistência a dano de arma e +${bonus} de dano corpo a corpo.`,
      `${actor.name} flies into a rage: resistance to weapon damage and +${bonus} melee damage.`,
    ),
    [actor.id],
  );
  if (dropped)
    s = addLog(
      s,
      T(
        `${actor.name} perde a concentração (a fúria impede).`,
        `${actor.name} loses concentration (rage prevents it).`,
      ),
      [actor.id],
    );
  const at = centerOf(state, actor.id);
  return attachFx(state, s, at ? [{ kind: 'burst', at, radius: 1.5, color: 'fire' }] : []);
}

/**
 * Ataque Furtivo: uma vez por turno, num acerto com arma de acuidade ou à distância, se o ataque
 * tem vantagem ou há outro inimigo do alvo (não incapacitado) a até 5 ft dele — e não há desvantagem.
 * Devolve os dados extras, ou `null`.
 */
export function sneakAttack(
  state: EncounterState,
  actor: Creature,
  target: Creature,
  weapon: { range: number; finesse?: boolean },
  mode: 'advantage' | 'disadvantage' | 'normal',
): string | null {
  if (!(actor.features ?? []).includes('sneak-attack')) return null;
  if (!(weapon.finesse || weapon.range > 5)) return null;
  if ((state.combat.sneakUsed ?? []).includes(actor.id)) return null;
  if (mode === 'disadvantage') return null;
  if (mode !== 'advantage') {
    const at = tokenOf(state, target.id);
    if (!at) return null;
    const flanked = state.tokens.some((t) => {
      if (t.creatureId === actor.id || t.creatureId === target.id) return false;
      const o = creatureOf(state, t.creatureId);
      return (
        teamOf(o) === teamOf(actor) &&
        canAct(o) &&
        distanceFt(t.pos, sizeOf(o), at.pos, sizeOf(target), state.rule) <= 5
      );
    });
    if (!flanked) return null;
  }
  return sneakAttackDice(actor.level);
}

export const markSneak = (state: EncounterState, id: string): EncounterState => ({
  ...state,
  combat: { ...state.combat, sneakUsed: [...(state.combat.sneakUsed ?? []), id] },
});
