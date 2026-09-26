import { Creature } from '../../models/creature';
import { EncounterState, Role, TurnState } from '../../models/encounter';
import { inBounds } from '../../models/grid';
import {
  applyDamage,
  heal,
  initiativeBonus,
  rollDeathSave,
  RuleError,
  abilityMod,
} from '../creature';
import { AdvMode, criticalExpr, parseDice, roll, rollD20, Rng } from '../dice';
import { canStand, distanceFt, findPath, key, MoveQuery } from '../grid/movement';
import { Command, PLAYER_COMMANDS } from './commands';
import {
  addLog,
  creatureOf,
  emptyCombat,
  ForbiddenError,
  occupiedCells,
  sizeOf,
  teamOf,
  tokenOf,
  withCreature,
} from './state';

export interface Context {
  rng: Rng;
  role: Role;
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** O jogador só age por criaturas suas; o Mestre pode tudo. */
export function authorize(cmd: Command, role: Role): void {
  if (role.kind === 'dm') return;
  if (!PLAYER_COMMANDS.includes(cmd.type)) {
    throw new ForbiddenError('Só o Mestre pode fazer isso.');
  }
  const actorId = (cmd as { actorId: string }).actorId;
  if (!role.owns.includes(actorId))
    throw new ForbiddenError('Você só controla os seus personagens.');
}

/** Aplica um comando e devolve o novo estado (o original nunca é alterado). Lança `RuleError` se for ilegal. */
export function dispatch(state: EncounterState, cmd: Command, ctx: Context): EncounterState {
  authorize(cmd, ctx.role);
  switch (cmd.type) {
    case 'addCreature':
      return addCreature(state, cmd);
    case 'removeCreature':
      return removeCreature(state, cmd.id);
    case 'placeToken':
      return placeToken(state, cmd.id, cmd.pos);
    case 'setHidden': {
      const c = creatureOf(state, cmd.id);
      if (!tokenOf(state, cmd.id)) throw new RuleError(`${c.name} não está no mapa.`);
      return {
        ...state,
        tokens: state.tokens.map((t) =>
          t.creatureId === cmd.id ? { ...t, hidden: cmd.hidden } : t,
        ),
      };
    }
    case 'setTerrain': {
      if (!inBounds(state.map, cmd.pos)) throw new RuleError('Fora do mapa.');
      if (cmd.terrain === 'wall' && occupiedCells(state).has(key(cmd.pos))) {
        throw new RuleError('Há uma criatura nessa célula.');
      }
      const cells = [...state.map.cells];
      cells[cmd.pos.y * state.map.width + cmd.pos.x] = cmd.terrain;
      return { ...state, map: { ...state.map, cells } };
    }
    case 'rollInitiative':
      return rollInitiative(state, ctx.rng);
    case 'setInitiative': {
      creatureOf(state, cmd.id);
      if (state.combat.phase === 'running') throw new RuleError('O combate já começou.');
      return {
        ...state,
        combat: {
          ...state.combat,
          initiative: { ...state.combat.initiative, [cmd.id]: cmd.value },
        },
      };
    }
    case 'startCombat':
      return startCombat(state);
    case 'endCombat':
      return addLog({ ...state, combat: emptyCombat() }, 'Combate encerrado.');
    case 'damage': {
      const target = creatureOf(state, cmd.targetId);
      const r = applyDamage(target, cmd.amount, { type: cmd.damageType });
      return checkOutcome(
        addLog(
          withCreature(state, r.creature),
          `${target.name} sofreu ${r.dealt} de dano${notes(r)}.`,
          [target.id],
        ),
      );
    }
    case 'heal': {
      const target = creatureOf(state, cmd.targetId);
      return addLog(withCreature(state, heal(target, cmd.amount)), `${target.name} foi curado.`, [
        target.id,
      ]);
    }
    case 'move':
      return move(state, cmd.actorId, cmd.to);
    case 'attack':
      return attack(state, cmd, ctx);
    case 'dash': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      spendAction(turn);
      return addLog(
        setTurn(state, { ...turn, action: false, dashed: true }),
        `${actor.name} correu (Disparada).`,
        [actor.id],
      );
    }
    case 'dodge': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      spendAction(turn);
      const s = setTurn(state, { ...turn, action: false });
      return addLog(
        { ...s, combat: { ...s.combat, dodging: [...s.combat.dodging, actor.id] } },
        `${actor.name} está em Esquiva.`,
        [actor.id],
      );
    }
    case 'disengage': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      spendAction(turn);
      return addLog(
        setTurn(state, { ...turn, action: false, disengaged: true }),
        `${actor.name} se desengajou.`,
        [actor.id],
      );
    }
    case 'deathSave': {
      const { actor } = actorTurn(state, cmd.actorId, 'dying');
      const r = rollDeathSave(actor, ctx.rng);
      return addLog(
        withCreature(state, r.creature),
        `${actor.name}: salvaguarda contra a morte d20 ${r.roll} — ${r.outcome}.`,
        [actor.id],
      );
    }
    case 'endTurn':
      actorTurn(state, cmd.actorId, 'any');
      return advanceTurn(state);
  }
}

const notes = (r: { instantDeath: boolean; creature: Creature; dropped: boolean }): string =>
  r.instantDeath
    ? ' — morte instantânea!'
    : r.creature.status === 'dead'
      ? ' — morreu'
      : r.dropped
        ? ' — caiu a 0 PV'
        : '';

// ---------- montagem ----------

function addCreature(
  state: EncounterState,
  cmd: Extract<Command, { type: 'addCreature' }>,
): EncounterState {
  const c = cmd.creature;
  if (state.creatures.some((x) => x.id === c.id))
    throw new RuleError('Essa criatura já está no encontro.');
  let s: EncounterState = { ...state, creatures: [...state.creatures, c] };
  if (cmd.pos) {
    s = placeToken(s, c.id, cmd.pos);
    if (cmd.hidden)
      s = {
        ...s,
        tokens: s.tokens.map((t) => (t.creatureId === c.id ? { ...t, hidden: true } : t)),
      };
  }
  // o registro é feito por último: se o token está oculto, a linha nasce secreta
  return addLog(s, `${c.name} entrou no encontro.`, [c.id]);
}

function removeCreature(state: EncounterState, id: string): EncounterState {
  const c = creatureOf(state, id);
  let s: EncounterState = {
    ...state,
    creatures: state.creatures.filter((x) => x.id !== id),
    tokens: state.tokens.filter((t) => t.creatureId !== id),
  };
  const { combat } = s;
  const idx = combat.order.indexOf(id);
  const initiative = { ...combat.initiative };
  delete initiative[id];
  if (idx < 0)
    return addLog({ ...s, combat: { ...combat, initiative } }, `${c.name} saiu do encontro.`);

  const order = combat.order.filter((x) => x !== id);
  const wasCurrent = combat.phase === 'running' && idx === combat.turnIndex;
  let turnIndex = idx < combat.turnIndex ? combat.turnIndex - 1 : combat.turnIndex;
  let round = combat.round;
  if (turnIndex >= order.length) {
    turnIndex = 0;
    round++;
  }
  s = { ...s, combat: { ...combat, order, initiative, turnIndex, round } };
  s = addLog(s, `${c.name} saiu do encontro.`);
  if (combat.phase !== 'running') return s;
  if (order.length === 0) return { ...s, combat: emptyCombat() };
  const outcome = checkOutcome(s);
  if (outcome.combat.phase === 'ended') return outcome;
  return wasCurrent ? beginTurn(s) : s;
}

function placeToken(
  state: EncounterState,
  id: string,
  pos: { x: number; y: number },
): EncounterState {
  const c = creatureOf(state, id);
  const blocked = occupiedCells(state, (o) => o.id !== id);
  if (!canStand(state.map, pos, sizeOf(c), blocked))
    throw new RuleError('Não cabe aí (parede, borda ou outra criatura).');
  const existing = tokenOf(state, id);
  const tokens = existing
    ? state.tokens.map((t) => (t.creatureId === id ? { ...t, pos } : t))
    : [...state.tokens, { creatureId: id, pos }];
  return { ...state, tokens };
}

function rollInitiative(state: EncounterState, rng: Rng): EncounterState {
  if (state.combat.phase === 'running') throw new RuleError('O combate já começou.');
  const initiative: Record<string, number> = {};
  const parts: string[] = [];
  for (const c of state.creatures) {
    if (!tokenOf(state, c.id)) continue;
    const r = rollD20(initiativeBonus(c), 'normal', rng);
    initiative[c.id] = r.roll.total;
    parts.push(`${c.name} ${r.roll.total}`);
  }
  if (!parts.length) throw new RuleError('Coloque criaturas no mapa antes de rolar a iniciativa.');
  return addLog(
    { ...state, combat: { ...state.combat, phase: 'setup', initiative } },
    `Iniciativa: ${parts.join(', ')}.`,
  );
}

// ---------- combate ----------

function startCombat(state: EncounterState): EncounterState {
  if (state.combat.phase === 'running') throw new RuleError('O combate já começou.');
  const order = state.creatures
    .filter((c) => state.combat.initiative[c.id] !== undefined && tokenOf(state, c.id))
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        state.combat.initiative[b.c.id] - state.combat.initiative[a.c.id] ||
        abilityMod(b.c.abilities.dex) - abilityMod(a.c.abilities.dex) ||
        a.i - b.i,
    )
    .map((x) => x.c.id);
  if (order.length === 0) throw new RuleError('Role a iniciativa antes de começar.');

  let s: EncounterState = {
    ...state,
    combat: {
      ...emptyCombat(),
      phase: 'running',
      round: 1,
      order,
      initiative: state.combat.initiative,
    },
  };
  s = addLog(s, 'O combate começou.');
  // se o primeiro da ordem já está morto, pula para o próximo vivo
  return creatureOf(s, order[0]).status === 'dead' ? advanceTurn(s) : beginTurn(s);
}

function newTurn(actorId: string): TurnState {
  return {
    actorId,
    action: true,
    bonus: true,
    reaction: true,
    movedFt: 0,
    dashed: false,
    disengaged: false,
    attacksLeft: 0,
  };
}

/** Começa o turno de `combat.order[turnIndex]`: zera o orçamento e encerra a Esquiva dele. */
function beginTurn(state: EncounterState): EncounterState {
  const actor = creatureOf(state, state.combat.order[state.combat.turnIndex]);
  const s: EncounterState = {
    ...state,
    combat: {
      ...state.combat,
      turn: newTurn(actor.id),
      dodging: state.combat.dodging.filter((id) => id !== actor.id),
    },
  };
  return addLog(s, `Turno de ${actor.name} (rodada ${s.combat.round}).`, [actor.id]);
}

function advanceTurn(state: EncounterState): EncounterState {
  const outcome = checkOutcome(state);
  if (outcome.combat.phase === 'ended') return outcome;
  const { order } = state.combat;
  let { turnIndex, round } = state.combat;
  for (let left = order.length; left > 0; left--) {
    turnIndex++;
    if (turnIndex >= order.length) {
      turnIndex = 0;
      round++;
    }
    if (creatureOf(state, order[turnIndex]).status !== 'dead') break;
  }
  return beginTurn({ ...state, combat: { ...state.combat, turnIndex, round } });
}

/** Termina o combate quando um dos lados não tem mais ninguém vivo. */
function checkOutcome(state: EncounterState): EncounterState {
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

function actorTurn(
  state: EncounterState,
  actorId: string,
  need: 'alive' | 'dying' | 'any' = 'alive',
) {
  const actor = creatureOf(state, actorId);
  const turn = state.combat.turn;
  if (state.combat.phase !== 'running' || !turn)
    throw new RuleError('O combate não está em andamento.');
  if (turn.actorId !== actorId) throw new RuleError(`Não é a vez de ${actor.name}.`);
  if (need === 'alive' && actor.status !== 'alive')
    throw new RuleError(`${actor.name} não pode agir agora.`);
  if (need === 'dying' && actor.status !== 'dying')
    throw new RuleError(`${actor.name} não está morrendo.`);
  return { actor, turn };
}

const setTurn = (state: EncounterState, turn: TurnState): EncounterState => ({
  ...state,
  combat: { ...state.combat, turn },
});

function spendAction(turn: TurnState): void {
  if (!turn.action) throw new RuleError('Sem ação disponível neste turno.');
}

/**
 * Consulta de movimento da criatura na vez: a mesma usada para validar `move`
 * e para a interface destacar as células alcançáveis.
 */
export function moveQuery(state: EncounterState, actorId: string): MoveQuery {
  const { actor, turn } = actorTurn(state, actorId);
  const from = tokenOf(state, actorId);
  if (!from) throw new RuleError(`${actor.name} não está no mapa.`);
  const remaining = actor.speed * (turn.dashed ? 2 : 1) - turn.movedFt;
  if (remaining <= 0) throw new RuleError('Sem deslocamento restante.');
  return {
    map: state.map,
    start: from.pos,
    size: sizeOf(actor),
    budgetFt: remaining,
    // atravessa aliados, mas não hostis
    blocked: occupiedCells(state, (o) => teamOf(o) !== teamOf(actor)),
    rule: state.rule,
  };
}

function move(
  state: EncounterState,
  actorId: string,
  to: { x: number; y: number },
): EncounterState {
  const { actor, turn } = actorTurn(state, actorId);
  const q = moveQuery(state, actorId);
  // não pode terminar sobre ninguém
  const anyone = occupiedCells(state, (o) => o.id !== actorId);
  if (!canStand(state.map, to, q.size, anyone))
    throw new RuleError('Destino bloqueado ou ocupado.');
  const found = findPath(q, to);
  if (!found) throw new RuleError('Fora do alcance de deslocamento.');

  const moved = {
    ...state,
    tokens: state.tokens.map((t) => (t.creatureId === actorId ? { ...t, pos: to } : t)),
  };
  return addLog(
    setTurn(moved, { ...turn, movedFt: turn.movedFt + found.costFt }),
    `${actor.name} se moveu ${found.costFt} ft.`,
    [actorId],
  );
}

function combineModes(modes: AdvMode[]): AdvMode {
  const adv = modes.includes('advantage');
  const dis = modes.includes('disadvantage');
  return adv && !dis ? 'advantage' : dis && !adv ? 'disadvantage' : 'normal';
}

function attack(
  state: EncounterState,
  cmd: Extract<Command, { type: 'attack' }>,
  ctx: Context,
): EncounterState {
  const { actor, turn } = actorTurn(state, cmd.actorId);
  const weapon = actor.attacks[cmd.attackIndex];
  if (!weapon) throw new RuleError('Ataque inexistente.');
  const target = creatureOf(state, cmd.targetId);
  if (target.id === actor.id) throw new RuleError('Não é possível atacar a si mesmo.');
  if (target.status === 'dead') throw new RuleError(`${target.name} já está morto.`);

  const from = tokenOf(state, actor.id);
  const at = tokenOf(state, target.id);
  if (!from || !at) throw new RuleError('Criatura fora do mapa.');
  if (ctx.role.kind === 'player' && at.hidden) throw new RuleError('Alvo não visível.');
  const dist = distanceFt(from.pos, sizeOf(actor), at.pos, sizeOf(target), state.rule);
  if (dist > weapon.range)
    throw new RuleError(`Alvo fora de alcance (${dist} ft; alcance ${weapon.range} ft).`);

  // ação: o 1º ataque gasta a ação Atacar; Ataque Extra usa os restantes
  let attacksLeft = turn.attacksLeft;
  let action = turn.action;
  if (attacksLeft > 0) attacksLeft--;
  else if (action) {
    action = false;
    attacksLeft = Math.max(0, actor.attacksPerAction - 1);
  } else throw new RuleError('Sem ação disponível neste turno.');

  const modes: AdvMode[] = [cmd.mode ?? 'normal'];
  if (state.combat.dodging.includes(target.id)) modes.push('disadvantage');
  if (weapon.range > 5) {
    const meleeFoe = state.tokens.some((t) => {
      const o = creatureOf(state, t.creatureId);
      return (
        teamOf(o) !== teamOf(actor) &&
        o.status !== 'dead' &&
        distanceFt(from.pos, sizeOf(actor), t.pos, sizeOf(o), state.rule) <= 5
      );
    });
    if (meleeFoe) modes.push('disadvantage'); // atirar com inimigo adjacente
  }
  const mode = combineModes(modes);

  const d20 = rollD20(weapon.bonus, mode, ctx.rng);
  const hit = d20.crit || (!d20.fumble && d20.roll.total >= target.ac);
  const head =
    `${actor.name} atacou ${target.name} com ${weapon.name}: d20 ${d20.natural} ${fmt(weapon.bonus)} = ${d20.roll.total} vs CA ${target.ac}` +
    (mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)');

  let next = setTurn(state, { ...turn, action, attacksLeft });
  if (!hit) return addLog(next, `${head} — erro.`, [actor.id, target.id]);

  const expr = parseDice(weapon.damage);
  const dmg = roll(d20.crit ? criticalExpr(expr) : expr, ctx.rng);
  const r = applyDamage(target, Math.max(0, dmg.total), { type: weapon.type, crit: d20.crit });
  next = withCreature(next, r.creature);
  next = addLog(
    next,
    `${head} — ${d20.crit ? 'ACERTO CRÍTICO' : 'acerto'}: ${r.dealt} de dano ${weapon.type}${notes(r)}.`,
    [actor.id, target.id],
  );
  return checkOutcome(next);
}
