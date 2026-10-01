import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Creature } from '../../models/creature';
import { SpellMove } from '../../models/spell';
import { RuleError } from '../creature';
import { canStand, distanceFt, findPath } from '../grid/movement';
import { T } from '../i18n';
import { distT } from '../units';
import { Context, setTurn } from './helpers';
import { addLog, creatureOf, occupiedCells, sizeOf, teamOf, tokenOf } from './state';
import { enterZones } from './upkeep';
import { queueOpportunities } from './reduce';

/**
 * Deslocamento de habilidade: segue o caminho do mapa (paredes e criaturas hostis barram), gasta o
 * deslocamento que a habilidade diz e só provoca ataque de oportunidade se ela não o evitar.
 */
export function moveByAbility(
  state: EncounterState,
  actor: Creature,
  spec: SpellMove,
  point: Pos | undefined,
  ctx: Context,
): EncounterState {
  const from = tokenOf(state, actor.id);
  if (!from) return state;
  if (!point) throw new RuleError(T('Escolha um ponto no mapa.', 'Choose a point on the map.'));
  const size = sizeOf(actor);
  const q = {
    map: state.map,
    start: from.pos,
    size,
    budgetFt: spec.ft,
    blocked: occupiedCells(state, (o) => teamOf(o) !== teamOf(actor)),
    rule: state.rule,
    mode: spec.mode === 'walk' || spec.mode === 'swim' ? spec.mode : ('fly' as const),
  };
  if (
    !canStand(
      state.map,
      point,
      size,
      occupiedCells(state, (o) => o.id !== actor.id),
    )
  )
    throw new RuleError(T('Destino bloqueado ou ocupado.', 'Destination is blocked or occupied.'));
  const found = findPath(q, point);
  if (!found)
    throw new RuleError(
      T(
        `Não dá para chegar lá em ${distT(spec.ft)} (caminho bloqueado ou longe demais).`,
        `Cannot get there within ${distT(spec.ft)} (blocked path or too far).`,
      ),
    );
  if (spec.towardEnemy) {
    const foes = state.tokens
      .map((t) => ({ t, c: creatureOf(state, t.creatureId) }))
      .filter(({ c }) => teamOf(c) !== teamOf(actor) && c.status !== 'dead');
    const gap = (p: Pos) =>
      Math.min(...foes.map(({ t, c }) => distanceFt(p, size, t.pos, sizeOf(c), state.rule)));
    if (foes.length && gap(point) >= gap(from.pos))
      throw new RuleError(
        T('Tem de terminar mais perto de um inimigo.', 'It must end closer to an enemy.'),
      );
  }
  let s = state;
  const turn = state.combat.turn;
  if (spec.spend && turn?.actorId === actor.id) {
    const sp = Math.max(actor.speed, actor.speeds?.fly ?? 0);
    const left = sp * (turn.dashed ? 2 : 1) - turn.movedFt;
    if (left < spec.spend)
      throw new RuleError(
        T(
          `Falta deslocamento (${distT(spec.spend)}) para o salto.`,
          `Not enough movement (${distT(spec.spend)}) for the leap.`,
        ),
      );
    s = setTurn(s, { ...turn, movedFt: turn.movedFt + spec.spend });
  }
  s = { ...s, tokens: s.tokens.map((t) => (t.creatureId === actor.id ? { ...t, pos: point } : t)) };
  s = addLog(
    s,
    T(
      `${actor.name} avança ${distT(found.costFt)}.`,
      `${actor.name} moves ${distT(found.costFt)}.`,
    ),
    [actor.id],
  );
  if (!spec.noOpportunity) s = queueOpportunities(s, actor.id, from.pos, point);
  return enterZones(s, actor.id, from.pos, ctx);
}
