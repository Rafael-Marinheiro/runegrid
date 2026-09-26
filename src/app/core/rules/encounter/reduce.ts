import { CONDITION_LABEL, Creature } from '../../models/creature';
import {
  EncounterState,
  PendingReaction,
  Role,
  RolledDie,
  TurnState,
} from '../../models/encounter';
import { inBounds, Pos } from '../../models/grid';
import {
  applyDamage,
  heal,
  initiativeBonus,
  rollDeathSave,
  RuleError,
  abilityMod,
  addCondition,
  attackModifiers,
  effectiveSpeed,
  removeCondition,
  tickConditions,
  canAct,
} from '../creature';
import { AdvMode, criticalExpr, parseDice, roll, rollD20, Rng } from '../dice';
import { canStand, distanceFt, findPath, key, MoveQuery } from '../grid/movement';
import { consume, itemDef } from '../inventory/inventory';
import { cast } from './cast';
import { consumeHelp, coverBonus } from './cover';
import {
  firstTrapOnPath,
  openDoor,
  paint,
  removeRoom,
  removeTrap,
  revealRoom,
  setFog,
  setMap,
  triggerTrap,
  upsertRoom,
  upsertTrap,
} from './mapedit';
import { Command, PLAYER_COMMANDS } from './commands';
import {
  actorTurn,
  aftermath,
  checkOutcome,
  combineModes,
  Context,
  dtype,
  fmt,
  notes,
  setTurn,
  spendAction,
} from './helpers';
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
  const dice: RolledDie[] = [];
  const rng = Object.assign(() => ctx.rng(), {
    record: (sides: number, rolled: { value: number; dropped: boolean }[]) =>
      dice.push(...rolled.map((d) => ({ sides, value: d.value, dropped: d.dropped }))),
  });
  const next = apply(state, cmd, { ...ctx, rng });
  if (!dice.length) return next;
  // os dados vão na primeira linha nova do registro (a tela junta os de todas as linhas novas)
  const i = next.log.findIndex((e) => e.id >= state.seq);
  if (i < 0) return next;
  return { ...next, log: next.log.map((e, k) => (k === i ? { ...e, dice } : e)) };
}

function apply(state: EncounterState, cmd: Command, ctx: Context): EncounterState {
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
    case 'paint':
      return paint(state, cmd.cells, cmd.terrain);
    case 'setFog':
      return setFog(state, cmd.cells, cmd.hidden);
    case 'setMap':
      return setMap(state, cmd.map);
    case 'setTexture':
      return { ...state, map: { ...state.map, texture: cmd.texture } };
    case 'upsertRoom':
      return upsertRoom(state, cmd.room);
    case 'removeRoom':
      return removeRoom(state, cmd.id);
    case 'revealRoom':
      return revealRoom(state, cmd.id, cmd.hidden);
    case 'upsertTrap':
      return upsertTrap(state, cmd.trap);
    case 'removeTrap':
      return removeTrap(state, cmd.id);
    case 'openDoor':
      return openDoor(state, cmd.actorId, cmd.pos);
    case 'rollInitiative':
      return rollInitiative(state, ctx.rng);
    case 'secretRoll': {
      const r = roll(cmd.expr, ctx.rng);
      const s = addLog(state, `Rolagem secreta ${cmd.expr}: ${r.total}`);
      return { ...s, log: s.log.map((e) => (e.id === s.seq - 1 ? { ...e, secret: true } : e)) };
    }
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
    case 'joinCombat':
      return joinCombat(state, cmd.id, ctx.rng);
    case 'endCombat':
      return addLog({ ...state, combat: emptyCombat() }, 'Combate encerrado.');
    case 'damage': {
      const target = creatureOf(state, cmd.targetId);
      const r = applyDamage(target, cmd.amount, { type: cmd.damageType });
      const s = addLog(
        withCreature(state, r.creature),
        `${target.name} sofreu ${r.dealt} de dano${notes(r)}.`,
        [target.id],
      );
      return checkOutcome(aftermath(s, target.id, r.dealt, ctx.rng));
    }
    case 'addCondition': {
      const target = creatureOf(state, cmd.targetId);
      const s = withCreature(state, addCondition(target, cmd.condition, cmd.rounds));
      const dur = cmd.rounds ? ` por ${cmd.rounds} rodada(s)` : '';
      return addLog(s, `${target.name} ficou ${CONDITION_LABEL[cmd.condition]}${dur}.`, [
        target.id,
      ]);
    }
    case 'removeCondition': {
      const target = creatureOf(state, cmd.targetId);
      return addLog(
        withCreature(state, removeCondition(target, cmd.condition)),
        `${target.name}: ${CONDITION_LABEL[cmd.condition]} removido.`,
        [target.id],
      );
    }
    case 'cast':
      return cast(state, cmd, ctx);
    case 'standUp': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      if (!actor.conditions.some((c) => c.name === 'prone'))
        throw new RuleError(`${actor.name} não está caído.`);
      const cost = Math.floor(effectiveSpeed(actor) / 2);
      const remaining = effectiveSpeed(actor) * (turn.dashed ? 2 : 1) - turn.movedFt;
      if (cost <= 0 || remaining < cost) throw new RuleError('Sem deslocamento para se levantar.');
      const s = withCreature(state, removeCondition(actor, 'prone'));
      return addLog(
        setTurn(s, { ...turn, movedFt: turn.movedFt + cost }),
        `${actor.name} se levantou.`,
        [actor.id],
      );
    }
    case 'heal': {
      const target = creatureOf(state, cmd.targetId);
      return addLog(withCreature(state, heal(target, cmd.amount)), `${target.name} foi curado.`, [
        target.id,
      ]);
    }
    case 'move':
      return move(state, cmd.actorId, cmd.to, ctx.rng);
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
    case 'useItem': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const item = (actor.inventory ?? []).find((i) => i.id === cmd.itemId);
      const d = item && itemDef(item);
      if (!d?.consume) throw new RuleError('Esse item não pode ser usado.');
      spendAction(turn);
      let c = consume(actor, cmd.itemId);
      let msg = `${actor.name} usou ${d.name}`;
      if (d.consume.heal) {
        const n = Math.max(0, roll(d.consume.heal, ctx.rng).total);
        c = heal(c, n);
        msg += ` e recuperou ${n} PV`;
      }
      if (d.consume.cures) {
        c = removeCondition(c, d.consume.cures);
        msg += ` e removeu ${CONDITION_LABEL[d.consume.cures]}`;
      }
      return addLog(withCreature(setTurn(state, { ...turn, action: false }), c), `${msg}.`, [
        actor.id,
      ]);
    }
    case 'help': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const target = creatureOf(state, cmd.targetId);
      const from = tokenOf(state, actor.id);
      const at = tokenOf(state, target.id);
      if (!from || !at) throw new RuleError('Criatura fora do mapa.');
      if (teamOf(target) === teamOf(actor)) throw new RuleError('Ajude contra um inimigo.');
      if (distanceFt(from.pos, sizeOf(actor), at.pos, sizeOf(target), state.rule) > 5)
        throw new RuleError('O inimigo precisa estar adjacente.');
      spendAction(turn);
      const s = setTurn(state, { ...turn, action: false });
      return addLog(
        {
          ...s,
          combat: {
            ...s.combat,
            helped: [...(s.combat.helped ?? []), { targetId: target.id, by: actor.id }],
          },
        },
        `${actor.name} ajuda contra ${target.name}.`,
        [actor.id, target.id],
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
    case 'reaction':
      return reaction(state, cmd.actorId, cmd.use, ctx.rng);
    case 'endTurn': {
      const { actor } = actorTurn(state, cmd.actorId, 'any');
      if ((state.combat.pending ?? []).length) {
        throw new RuleError('Há reações pendentes: use ou recuse antes de encerrar o turno.');
      }
      const t = tickConditions(actor);
      let s = withCreature(state, t.creature);
      for (const n of t.expired)
        s = addLog(s, `${actor.name}: ${CONDITION_LABEL[n]} terminou.`, [actor.id]);
      return advanceTurn(s);
    }
    default:
      // mensagens malformadas de jogadores nunca chegam aqui (validação), mas o reducer não confia em ninguém
      throw new RuleError('Comando desconhecido.');
  }
}

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

/** Entra num combate em andamento: rola iniciativa e se encaixa na ordem sem mudar de quem é a vez. */
function joinCombat(state: EncounterState, id: string, rng: Rng): EncounterState {
  const c = creatureOf(state, id);
  const { combat } = state;
  if (combat.phase !== 'running' || !combat.turn)
    throw new RuleError('O combate não está em andamento.');
  if (combat.order.includes(id)) throw new RuleError(`${c.name} já está na iniciativa.`);
  if (!tokenOf(state, id)) throw new RuleError(`Coloque ${c.name} no mapa primeiro.`);

  const r = rollD20(initiativeBonus(c), 'normal', rng);
  const initiative = { ...combat.initiative, [id]: r.roll.total };
  const current = combat.turn.actorId;
  const order = [...combat.order, id]
    .map((cid, i) => ({ cid, i }))
    .sort(
      (a, b) =>
        initiative[b.cid] - initiative[a.cid] ||
        abilityMod(creatureOf(state, b.cid).abilities.dex) -
          abilityMod(creatureOf(state, a.cid).abilities.dex) ||
        a.i - b.i,
    )
    .map((x) => x.cid);
  const next = {
    ...state,
    combat: { ...combat, initiative, order, turnIndex: order.indexOf(current) },
  };
  return addLog(next, `${c.name} entra no combate com iniciativa ${r.roll.total}.`, [id]);
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
      helped: (state.combat.helped ?? []).filter((h) => h.by !== actor.id),
      reactionUsed: (state.combat.reactionUsed ?? []).filter((id) => id !== actor.id),
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

/**
 * Consulta de movimento da criatura na vez: a mesma usada para validar `move`
 * e para a interface destacar as células alcançáveis.
 */
export function moveQuery(state: EncounterState, actorId: string): MoveQuery {
  const { actor, turn } = actorTurn(state, actorId);
  const from = tokenOf(state, actorId);
  if (!from) throw new RuleError(`${actor.name} não está no mapa.`);
  const remaining = effectiveSpeed(actor) * (turn.dashed ? 2 : 1) - turn.movedFt;
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
  rng: Rng,
): EncounterState {
  const { actor, turn } = actorTurn(state, actorId);
  const q = moveQuery(state, actorId);
  // não pode terminar sobre ninguém
  const anyone = occupiedCells(state, (o) => o.id !== actorId);
  if (!canStand(state.map, to, q.size, anyone))
    throw new RuleError('Destino bloqueado ou ocupado.');
  const found = findPath(q, to);
  if (!found) throw new RuleError('Fora do alcance de deslocamento.');

  // uma armadilha armada no caminho interrompe o movimento nela
  const hit = firstTrapOnPath(state, found.path, q.size);
  const stop = hit ? found.path[hit.index] : to;
  const cost = hit ? (findPath(q, stop)?.costFt ?? found.costFt) : found.costFt;

  const moved = {
    ...state,
    tokens: state.tokens.map((t) => (t.creatureId === actorId ? { ...t, pos: stop } : t)),
  };
  const s = addLog(
    setTurn(moved, { ...turn, movedFt: turn.movedFt + cost }),
    `${actor.name} se moveu ${cost} ft.`,
    [actorId],
  );
  const queued = turn.disengaged ? s : queueOpportunities(s, actorId, q.start, stop);
  return hit ? triggerTrap(queued, actorId, hit.trap.id, rng) : queued;
}

/** Quem estava ao alcance e deixou de estar (sem Desengajar) dá uma reação a cada inimigo capaz. */
function queueOpportunities(
  state: EncounterState,
  moverId: string,
  from: Pos,
  to: Pos,
): EncounterState {
  const mover = creatureOf(state, moverId);
  const pending = [...(state.combat.pending ?? [])];
  let seq = pending.reduce((n, p) => Math.max(n, p.id), 0);
  for (const t of state.tokens) {
    const h = creatureOf(state, t.creatureId);
    if (teamOf(h) === teamOf(mover) || !canAct(h)) continue;
    if ((state.combat.reactionUsed ?? []).includes(h.id)) continue;
    const melee = h.attacks.map((a, i) => ({ a, i })).filter((x) => x.a.range <= 10);
    if (!melee.length) continue;
    const reach = Math.max(...melee.map((x) => x.a.range));
    const before = distanceFt(t.pos, sizeOf(h), from, sizeOf(mover), state.rule);
    const after = distanceFt(t.pos, sizeOf(h), to, sizeOf(mover), state.rule);
    if (before > reach || after <= reach) continue;
    pending.push({
      id: ++seq,
      kind: 'opportunity',
      reactorId: h.id,
      targetId: moverId,
      attackIndex: melee[0].i,
      reach,
    });
  }
  if (pending.length === (state.combat.pending ?? []).length) return state;
  const added = pending.slice((state.combat.pending ?? []).length);
  const names = added.map((p) => creatureOf(state, p.reactorId).name).join(', ');
  return addLog(
    { ...state, combat: { ...state.combat, pending } },
    `${mover.name} saiu do alcance de ${names}: ataque de oportunidade possível.`,
    [moverId],
  );
}

function reaction(
  state: EncounterState,
  reactorId: string,
  use: boolean,
  rng: Rng,
): EncounterState {
  const pending = state.combat.pending ?? [];
  const p = pending.find((x: PendingReaction) => x.reactorId === reactorId);
  if (!p) throw new RuleError('Não há reação pendente para essa criatura.');
  const rest = { ...state, combat: { ...state.combat, pending: pending.filter((x) => x !== p) } };
  const reactor = creatureOf(state, reactorId);
  if (!use) return addLog(rest, `${reactor.name} recusa o ataque de oportunidade.`, [reactorId]);

  const target = creatureOf(state, p.targetId);
  if (!canAct(reactor)) throw new RuleError(`${reactor.name} não pode reagir agora.`);
  if (target.status === 'dead')
    return addLog(rest, `${reactor.name}: o alvo já está morto.`, [reactorId]);
  const used = {
    ...rest,
    combat: { ...rest.combat, reactionUsed: [...(rest.combat.reactionUsed ?? []), reactorId] },
  };
  const announced = addLog(
    used,
    `${reactor.name} usa a reação: ataque de oportunidade contra ${target.name}.`,
    [reactorId, target.id],
  );
  return strike(announced, reactor, target, p.attackIndex, p.reach, [], rng);
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

  const extra: AdvMode[] = [cmd.mode ?? 'normal'];
  if (state.combat.dodging.includes(target.id)) extra.push('disadvantage');
  return strike(
    setTurn(state, { ...turn, action, attacksLeft }),
    actor,
    target,
    cmd.attackIndex,
    dist,
    extra,
    ctx.rng,
  );
}

/** Rola um ataque já validado (alcance, ação): condições, crítico, dano e concentração. */
function strike(
  state: EncounterState,
  actor: Creature,
  target: Creature,
  attackIndex: number,
  dist: number,
  extra: AdvMode[],
  rng: Rng,
): EncounterState {
  const weapon = actor.attacks[attackIndex];
  const from = tokenOf(state, actor.id)!;
  const modes = [...extra];
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
  const cond = attackModifiers(actor, target, dist, weapon.range > 5);
  const helped = consumeHelp(state, target.id);
  state = helped.state;
  const mode = combineModes([...modes, ...helped.modes, ...cond.modes]);
  const at = tokenOf(state, target.id)!;
  const cover = coverBonus(state, from.pos, at.pos);
  const ac = target.ac + cover;

  const d20 = rollD20(weapon.bonus, mode, rng);
  const hit = d20.crit || (!d20.fumble && d20.roll.total >= ac);
  const crit = hit && (d20.crit || cond.autoCrit);
  const head =
    `${actor.name} atacou ${target.name} com ${weapon.name}: d20 ${d20.natural} ${fmt(weapon.bonus)} = ${d20.roll.total} vs CA ${ac}${cover ? ` (cobertura +${cover})` : ''}` +
    (mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)');
  if (!hit) return addLog(state, `${head} — erro.`, [actor.id, target.id]);

  const expr = parseDice(weapon.damage);
  const dmg = roll(crit ? criticalExpr(expr) : expr, rng);
  const r = applyDamage(target, Math.max(0, dmg.total), { type: weapon.type, crit });
  let next = withCreature(state, r.creature);
  next = addLog(
    next,
    `${head} — ${crit ? 'ACERTO CRÍTICO' : 'acerto'}: ${r.dealt} de dano ${dtype(weapon.type)}${notes(r)}.`,
    [actor.id, target.id],
  );
  return checkOutcome(aftermath(next, target.id, r.dealt, rng));
}
