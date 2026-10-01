import { CONDITION_LABEL, Creature } from '../../models/creature';
import {
  EncounterState,
  PendingReaction,
  Role,
  RolledDie,
  TurnState,
} from '../../models/encounter';
import { isMapBackground, Pos } from '../../models/grid';
import {
  applyDamage,
  heal,
  initiativeBonus,
  passivePerception,
  rollDeathSave,
  RuleError,
  abilityMod,
  addCondition,
  attackModifiers,
  effectiveSpeed,
  effectiveSpeedOf,
  removeCondition,
  tickConditions,
  canAct,
  skillBonus,
  hasNoReactions,
  effectiveAc,
  allMods,
  weaponBonus,
  weaponRiders,
  effectsOf,
} from '../creature';
import { AdvMode, criticalExpr, parseDice, roll, rollD20, Rng } from '../dice';
import { canStand, distanceFt, findPath, footprint, MoveMode, MoveQuery } from '../grid/movement';
import { hasLineOfSight } from '../grid/visibility';
import { consume, itemDef } from '../inventory/inventory';
import { markSneak, sneakAttack, useFeature } from './abilities';
import { keepRage, meleeDamageBonus, rageEndOfTurn } from './rage';
import { riderOf } from '../monsters/registry';
import { allyAdjacent } from './traits';
import { abilityReady, legendaryGate, payAbility } from './ability';
import { Spell } from '../../models/spell';
import { getSpell } from '../spells/data';
import { damageParts } from '../spells/scaling';
import { cast } from './cast';
import { freeReaction, spellReaction } from './reaction-flow';
import { holdOrApply } from './hits';
import {
  attackExtra,
  consumeAttacked,
  consumeWeaponRiders,
  damageDieTotal,
  decoy,
  dropOnAttack,
} from './rolls';
import { beginUpkeep, endUpkeep, enterZones, syncConcentration, tickZones } from './upkeep';
import { consumeHelp, coverBonus } from './cover';
import {
  firstTrapOnPath,
  openDoor,
  paint,
  removeRoom,
  removeItem,
  removeMapObject,
  removeTrap,
  revealRoom,
  setFog,
  setMap,
  triggerTrap,
  upsertRoom,
  upsertItem,
  upsertMapObject,
  upsertTrap,
} from './mapedit';
import { isTokenArt } from '../srd/miniature';
import { attachFx, attackFx } from './fx';
import { Command, MoveKind, PLAYER_COMMANDS } from './commands';
import {
  addFloor,
  removeFloor,
  removePortal,
  setFloors,
  switchFloor,
  travelPortal,
  upsertPortal,
} from './floors';
import {
  actorTurn,
  aftermath,
  checkOutcome,
  combineModes,
  Context,
  fmt,
  notes,
  setTurn,
  spendAction,
  spendCost,
} from './helpers';
import {
  addLog,
  creatureOf,
  emptyCombat,
  ForbiddenError,
  occupiedCells,
  sizeOf,
  ownsCreature,
  teamOf,
  tokenOf,
  withCreature,
} from './state';
import { T, condT, spellName } from '../i18n';
import { syncSummons } from './summon';
import { alertsAfterMove } from './alerts';
import { sunPenalty } from './environment';
import { moveByAbility } from './jump';
import { attackAllowed, planeError, samePlane, syncForms } from './forms';
import { distT } from '../units';

/** O jogador só age por criaturas suas; o Mestre pode tudo. */
export function authorize(cmd: Command, role: Role, state?: EncounterState): void {
  if (role.kind === 'dm') return;
  if (!PLAYER_COMMANDS.includes(cmd.type)) {
    throw new ForbiddenError(T('Só o Mestre pode fazer isso.', 'Only the GM can do that.'));
  }
  const actorId = (cmd as { actorId: string }).actorId;
  if (!(state ? ownsCreature(state, role, actorId) : role.owns.includes(actorId)))
    throw new ForbiddenError(
      T('Você só controla os seus personagens.', 'You only control your own characters.'),
    );
}

/** Aplica um comando e devolve o novo estado (o original nunca é alterado). Lança `RuleError` se for ilegal. */
export function dispatch(state: EncounterState, cmd: Command, ctx: Context): EncounterState {
  const dice: RolledDie[] = [];
  const rng = Object.assign(() => ctx.rng(), {
    record: (sides: number, rolled: { value: number; dropped: boolean }[]) =>
      dice.push(...rolled.map((d) => ({ sides, value: d.value, dropped: d.dropped }))),
  });
  const next = syncForms(
    syncSummons(syncConcentration(apply(state, cmd, { ...ctx, rng })), {
      ...ctx,
      rng,
    }),
  );
  if (!dice.length) return next;
  // os dados vão na primeira linha nova do registro (a tela junta os de todas as linhas novas)
  const i = next.log.findIndex((e) => e.id >= state.seq);
  if (i < 0) return next;
  return { ...next, log: next.log.map((e, k) => (k === i ? { ...e, dice } : e)) };
}

function apply(state: EncounterState, cmd: Command, ctx: Context): EncounterState {
  authorize(cmd, ctx.role, state);
  switch (cmd.type) {
    case 'addCreature':
      return addCreature(state, cmd);
    case 'removeCreature':
      return removeCreature(state, cmd.id, ctx);
    case 'placeToken':
      return placeToken(state, cmd.id, cmd.pos);
    case 'setHidden': {
      const c = creatureOf(state, cmd.id);
      if (!tokenOf(state, cmd.id))
        throw new RuleError(T(`${c.name} não está no mapa.`, `${c.name} is not on the map.`));
      return {
        ...state,
        tokens: state.tokens.map((t) =>
          t.creatureId === cmd.id ? { ...t, hidden: cmd.hidden } : t,
        ),
      };
    }
    case 'setTokenArt': {
      const c = { ...creatureOf(state, cmd.id) };
      delete c.tokenArt;
      if (cmd.art !== undefined && !isTokenArt(cmd.art))
        throw new RuleError(T('Miniatura inválida.', 'Invalid miniature.'));
      return withCreature(state, cmd.art ? { ...c, tokenArt: cmd.art } : c);
    }
    case 'setTerrain': {
      return paint(state, [cmd.pos], cmd.terrain);
    }
    case 'paint':
      return paint(state, cmd.cells, cmd.terrain);
    case 'setFog':
      return setFog(state, cmd.cells, cmd.hidden);
    case 'setMap':
      return setMap(state, cmd.map);
    case 'setTexture':
      return { ...state, map: { ...state.map, texture: cmd.texture } };
    case 'setMapBackground':
      if (!isMapBackground(cmd.background))
        throw new RuleError(T('Imagem de fundo inválida.', 'Invalid background image.'));
      return { ...state, map: { ...state.map, background: cmd.background } };
    case 'setVision':
      return { ...state, map: { ...state.map, vision: cmd.vision } };
    case 'setEnvironment': {
      const map = {
        ...state.map,
        ...(cmd.sunlight !== undefined ? { sunlight: cmd.sunlight } : {}),
        ...(cmd.runningWater !== undefined ? { runningWater: cmd.runningWater } : {}),
      };
      const note = [
        cmd.sunlight !== undefined
          ? T(
              `Luz do sol ${cmd.sunlight ? 'ligada' : 'desligada'}.`,
              `Sunlight ${cmd.sunlight ? 'on' : 'off'}.`,
            )
          : '',
        cmd.runningWater !== undefined
          ? T(
              `Água corrente ${cmd.runningWater ? 'ligada' : 'desligada'}.`,
              `Running water ${cmd.runningWater ? 'on' : 'off'}.`,
            )
          : '',
      ].filter(Boolean);
      return note.length ? addLog({ ...state, map }, note.join(' ')) : { ...state, map };
    }
    case 'addFloor':
      return addFloor(state, cmd);
    case 'removeFloor':
      return removeFloor(state, cmd.id);
    case 'switchFloor':
      return switchFloor(state, cmd.id);
    case 'setFloors':
      return setFloors(state, cmd.floorId, cmd.floorName, cmd.floors);
    case 'upsertPortal':
      return upsertPortal(state, cmd.portal);
    case 'removePortal':
      return removePortal(state, cmd.id);
    case 'travelPortal':
      return travelPortal(state, cmd.id);
    case 'upsertRoom':
      return upsertRoom(state, cmd.room);
    case 'removeRoom':
      return removeRoom(state, cmd.id);
    case 'setResidence': {
      const room = (state.map.rooms ?? []).find((r) => r.id === cmd.id);
      if (!room) throw new RuleError(T('Sala não encontrada.', 'Room not found.'));
      const invited = new Set(room.invited ?? []);
      if (cmd.invite) invited.add(cmd.invite);
      if (cmd.uninvite) invited.delete(cmd.uninvite);
      const next = {
        ...room,
        ...(cmd.residence !== undefined ? { residence: cmd.residence } : {}),
        invited: [...invited],
      };
      return {
        ...state,
        map: {
          ...state.map,
          rooms: (state.map.rooms ?? []).map((r) => (r.id === room.id ? next : r)),
        },
      };
    }
    case 'stake':
      return stake(state, cmd.targetId, cmd.remove === true);
    case 'moveSummon': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const dog = creatureOf(state, cmd.summonId);
      if (dog.summon?.by !== actor.id || !dog.summon.guard?.movable)
        throw new RuleError(
          T(
            'Só o cão que você conjurou (2024) se move com a ação Magia.',
            'Only the hound you conjured (2024) moves with the Magic action.',
          ),
        );
      spendAction(turn);
      const s = setTurn(state, { ...turn, action: false });
      return moveByAbility(s, dog, { ft: 30, noOpportunity: true, mode: 'fly' }, cmd.to, ctx);
    }
    case 'revealRoom':
      return revealRoom(state, cmd.id, cmd.hidden);
    case 'upsertTrap':
      return upsertTrap(state, cmd.trap);
    case 'removeTrap':
      return removeTrap(state, cmd.id);
    case 'upsertItem':
      return upsertItem(state, cmd.item);
    case 'removeItem':
      return removeItem(state, cmd.id);
    case 'upsertMapObject':
      return upsertMapObject(state, cmd.object);
    case 'removeMapObject':
      return removeMapObject(state, cmd.id);
    case 'openDoor':
      return openDoor(state, cmd.actorId, cmd.pos);
    case 'rollInitiative':
      return rollInitiative(state, ctx.rng);
    case 'secretRoll': {
      const r = roll(cmd.expr, ctx.rng);
      const s = addLog(
        state,
        T(`Rolagem secreta ${cmd.expr}: ${r.total}`, `Secret roll ${cmd.expr}: ${r.total}`),
      );
      return { ...s, log: s.log.map((e) => (e.id === s.seq - 1 ? { ...e, secret: true } : e)) };
    }
    case 'setInitiative': {
      creatureOf(state, cmd.id);
      if (state.combat.phase === 'running')
        throw new RuleError(T('O combate já começou.', 'Combat has already started.'));
      return {
        ...state,
        combat: {
          ...state.combat,
          initiative: { ...state.combat.initiative, [cmd.id]: cmd.value },
        },
      };
    }
    case 'startCombat':
      return startCombat(state, ctx);
    case 'joinCombat':
      return joinCombat(state, cmd.id, ctx.rng);
    case 'endCombat': {
      if (state.combat.phase !== 'running')
        throw new RuleError(T('O combate não está em andamento.', 'Combat is not in progress.'));
      return addLog(
        { ...state, combat: { ...state.combat, phase: 'ended', turn: null } },
        T('Combate encerrado pelo Mestre.', 'Combat ended by the GM.'),
      );
    }
    case 'resetCombat':
      if (state.combat.phase !== 'ended')
        throw new RuleError(T('O combate ainda não terminou.', 'Combat has not ended yet.'));
      return addLog(
        { ...state, combat: emptyCombat() },
        T('Novo combate em montagem.', 'New combat being set up.'),
      );
    case 'damage': {
      const target = creatureOf(state, cmd.targetId);
      const r = applyDamage(target, cmd.amount, { type: cmd.damageType });
      const s = addLog(
        withCreature(state, r.creature),
        T(
          `${target.name} sofreu ${r.dealt} de dano${notes(r)}.`,
          `${target.name} took ${r.dealt} damage${notes(r)}.`,
        ),
        [target.id],
      );
      return checkOutcome(aftermath(s, target.id, r.dealt, ctx.rng));
    }
    case 'addCondition': {
      const target = creatureOf(state, cmd.targetId);
      const s = withCreature(state, addCondition(target, cmd.condition, cmd.rounds));
      const dur = cmd.rounds
        ? T(` por ${cmd.rounds} rodada(s)`, ` for ${cmd.rounds} round(s)`)
        : '';
      return addLog(
        s,
        T(
          `${target.name} ficou ${CONDITION_LABEL[cmd.condition]}${dur}.`,
          `${target.name} is now ${condT(cmd.condition)}${dur}.`,
        ),
        [target.id],
      );
    }
    case 'removeCondition': {
      const target = creatureOf(state, cmd.targetId);
      return addLog(
        withCreature(state, removeCondition(target, cmd.condition)),
        T(
          `${target.name}: ${CONDITION_LABEL[cmd.condition]} removido.`,
          `${target.name}: ${condT(cmd.condition)} removed.`,
        ),
        [target.id],
      );
    }
    case 'cast': {
      const sp = getSpell(cmd.spellId, cmd.ruleset);
      return revealToken(
        sp?.ability?.attack ? abilityStrike(state, cmd, sp, ctx) : cast(state, cmd, ctx),
        cmd.actorId,
      );
    }
    case 'standUp': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      if (!actor.conditions.some((c) => c.name === 'prone'))
        throw new RuleError(T(`${actor.name} não está caído.`, `${actor.name} is not prone.`));
      const cost = Math.floor(effectiveSpeed(actor) / 2);
      const remaining = effectiveSpeed(actor) * (turn.dashed ? 2 : 1) - turn.movedFt;
      if (cost <= 0 || remaining < cost)
        throw new RuleError(
          T('Sem deslocamento para se levantar.', 'Not enough movement to stand up.'),
        );
      const s = withCreature(state, removeCondition(actor, 'prone'));
      return addLog(
        setTurn(s, { ...turn, movedFt: turn.movedFt + cost }),
        T(`${actor.name} se levantou.`, `${actor.name} stood up.`),
        [actor.id],
      );
    }
    case 'heal': {
      const target = creatureOf(state, cmd.targetId);
      return addLog(
        withCreature(state, heal(target, cmd.amount)),
        T(`${target.name} foi curado.`, `${target.name} was healed.`),
        [target.id],
      );
    }
    case 'move':
      return move(state, cmd.actorId, cmd.to, ctx, cmd.mode);
    case 'attack':
      return attack(state, cmd, ctx);
    case 'dash': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const paid = spendCost(actor, turn, 'dash', cmd.bonus);
      return addLog(
        setTurn(state, { ...turn, [paid]: false, dashed: true }),
        T(
          `${actor.name} correu (Disparada${paid === 'bonus' ? ', ação bônus' : ''}).`,
          `${actor.name} dashed (Dash${paid === 'bonus' ? ', bonus action' : ''}).`,
        ),
        [actor.id],
      );
    }
    case 'feature':
      return useFeature(state, cmd, ctx.rng);
    case 'dodge': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      spendAction(turn);
      const s = setTurn(state, { ...turn, action: false });
      return addLog(
        { ...s, combat: { ...s.combat, dodging: [...s.combat.dodging, actor.id] } },
        T(`${actor.name} está em Esquiva.`, `${actor.name} is dodging.`),
        [actor.id],
      );
    }
    case 'disengage': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const paid = spendCost(actor, turn, 'disengage', cmd.bonus);
      return addLog(
        setTurn(state, { ...turn, [paid]: false, disengaged: true }),
        T(
          `${actor.name} se desengajou${paid === 'bonus' ? ' (ação bônus)' : ''}.`,
          `${actor.name} disengaged${paid === 'bonus' ? ' (bonus action)' : ''}.`,
        ),
        [actor.id],
      );
    }
    case 'hide': {
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const token = tokenOf(state, actor.id);
      if (!token) throw new RuleError(T('Criatura fora do mapa.', 'Creature is off the map.'));
      if (token.hidden)
        throw new RuleError(T(`${actor.name} já está oculto.`, `${actor.name} is already hidden.`));
      const observers = state.tokens
        .map((other) => ({ token: other, creature: creatureOf(state, other.creatureId) }))
        .filter(({ creature }) => teamOf(creature) !== teamOf(actor) && creature.status !== 'dead');
      const seen = observers.some(({ token: other, creature: observer }) => {
        if (observer.conditions.some((condition) => condition.name === 'blinded')) return false;
        const range = state.map.vision?.darkness ? (observer.darkvision ?? 0) / 5 : Infinity;
        return footprint(other.pos, sizeOf(observer)).some((from) =>
          footprint(token.pos, sizeOf(actor)).some(
            (to) =>
              Math.hypot(from.x - to.x, from.y - to.y) <= range &&
              hasLineOfSight(state.map, from, to),
          ),
        );
      });
      if (seen)
        throw new RuleError(
          T(
            'Saia da vista dos inimigos para se esconder.',
            "Get out of the enemies' sight to hide.",
          ),
        );
      const paid = spendCost(actor, turn, 'hide', cmd.bonus);
      const bonus = skillBonus(actor, 'stealth');
      const check = rollD20(bonus, 'normal', ctx.rng);
      const dc = Math.max(0, ...observers.map(({ creature }) => passivePerception(creature)));
      let next = addLog(
        setTurn(state, { ...turn, [paid]: false }),
        T(
          `${actor.name} tentou se esconder: d20 ${check.natural} ${fmt(bonus)} = ${check.roll.total}.`,
          `${actor.name} tried to hide: d20 ${check.natural} ${fmt(bonus)} = ${check.roll.total}.`,
        ),
        [actor.id],
      );
      if (check.roll.total >= dc)
        next = {
          ...next,
          tokens: next.tokens.map((item) =>
            item.creatureId === actor.id ? { ...item, hidden: true } : item,
          ),
        };
      return next;
    }
    case 'useItem': {
      if (creatureOf(state, cmd.actorId).form?.meldsGear)
        throw new RuleError(
          T(
            'O equipamento está fundido à forma atual e não pode ser usado.',
            'The gear is melded into the current form and cannot be used.',
          ),
        );
      const { actor, turn } = actorTurn(state, cmd.actorId);
      const item = (actor.inventory ?? []).find((i) => i.id === cmd.itemId);
      const d = item && itemDef(item);
      if (!d?.consume)
        throw new RuleError(T('Esse item não pode ser usado.', 'That item cannot be used.'));
      spendAction(turn);
      let c = consume(actor, cmd.itemId);
      let msg = T(`${actor.name} usou ${d.name}`, `${actor.name} used ${d.name}`);
      if (d.consume.heal) {
        const n = Math.max(0, roll(d.consume.heal, ctx.rng).total);
        c = heal(c, n);
        msg += T(` e recuperou ${n} PV`, ` and regained ${n} HP`);
      }
      if (d.consume.cures) {
        c = removeCondition(c, d.consume.cures);
        msg += T(
          ` e removeu ${CONDITION_LABEL[d.consume.cures]}`,
          ` and removed ${condT(d.consume.cures)}`,
        );
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
      if (!from || !at)
        throw new RuleError(T('Criatura fora do mapa.', 'Creature is off the map.'));
      if (teamOf(target) === teamOf(actor))
        throw new RuleError(T('Ajude contra um inimigo.', 'Help against an enemy.'));
      if (distanceFt(from.pos, sizeOf(actor), at.pos, sizeOf(target), state.rule) > 5)
        throw new RuleError(T('O inimigo precisa estar adjacente.', 'The enemy must be adjacent.'));
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
        T(
          `${actor.name} ajuda contra ${target.name}.`,
          `${actor.name} helps against ${target.name}.`,
        ),
        [actor.id, target.id],
      );
    }
    case 'deathSave': {
      const { actor } = actorTurn(state, cmd.actorId, 'dying');
      const r = rollDeathSave(actor, ctx.rng);
      return addLog(
        withCreature(state, r.creature),
        T(
          `${actor.name}: salvaguarda contra a morte d20 ${r.roll} — ${DEATH_OUTCOME[r.outcome][0]}.`,
          `${actor.name}: death saving throw d20 ${r.roll} — ${DEATH_OUTCOME[r.outcome][1]}.`,
        ),
        [actor.id],
      );
    }
    case 'reaction': {
      const pend = (state.combat.pending ?? []).find((x) => x.reactorId === cmd.actorId);
      if (pend?.kind === 'spell') return spellReaction(state, cmd, pend, ctx);
      if (!pend && cmd.spellId) return freeReaction(state, cmd, ctx);
      return reaction(state, cmd.actorId, cmd.use, ctx.rng);
    }
    case 'endTurn': {
      const { actor } = actorTurn(state, cmd.actorId, 'any');
      if ((state.combat.pending ?? []).length) {
        throw new RuleError(
          T(
            'Há reações pendentes: use ou recuse antes de encerrar o turno.',
            'Pending reactions: use or decline them before ending the turn.',
          ),
        );
      }
      const raged = rageEndOfTurn(state, actor.id);
      const t = tickConditions(creatureOf(raged, actor.id));
      let s = withCreature(raged, t.creature);
      for (const n of t.expired)
        s = addLog(
          s,
          T(`${actor.name}: ${CONDITION_LABEL[n]} terminou.`, `${actor.name}: ${condT(n)} ended.`),
          [actor.id],
        );
      return advanceTurn(endUpkeep(s, actor.id, ctx), ctx);
    }
    default:
      // mensagens malformadas de jogadores nunca chegam aqui (validação), mas o reducer não confia em ninguém
      throw new RuleError(T('Comando desconhecido.', 'Unknown command.'));
  }
}

// ---------- montagem ----------

function addCreature(
  state: EncounterState,
  cmd: Extract<Command, { type: 'addCreature' }>,
): EncounterState {
  const c = cmd.creature;
  if (state.creatures.some((x) => x.id === c.id))
    throw new RuleError(
      T('Essa criatura já está no encontro.', 'That creature is already in the encounter.'),
    );
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
  return addLog(s, T(`${c.name} entrou no encontro.`, `${c.name} joined the encounter.`), [c.id]);
}

export function removeCreature(
  state: EncounterState,
  id: string,
  ctx: Context,
  log = true,
): EncounterState {
  const c = creatureOf(state, id);
  let s: EncounterState = {
    ...state,
    creatures: state.creatures.filter((x) => x.id !== id),
    tokens: state.tokens.filter((t) => t.creatureId !== id),
    floors: (state.floors ?? []).map((floor) => ({
      ...floor,
      tokens: floor.tokens.filter((token) => token.creatureId !== id),
    })),
  };
  const { combat } = s;
  const idx = combat.order.indexOf(id);
  const initiative = { ...combat.initiative };
  delete initiative[id];
  if (idx < 0)
    return log
      ? addLog(
          { ...s, combat: { ...combat, initiative } },
          T(`${c.name} saiu do encontro.`, `${c.name} left the encounter.`),
        )
      : { ...s, combat: { ...combat, initiative } };

  const order = combat.order.filter((x) => x !== id);
  const wasCurrent = combat.phase === 'running' && idx === combat.turnIndex;
  let turnIndex = idx < combat.turnIndex ? combat.turnIndex - 1 : combat.turnIndex;
  let round = combat.round;
  if (turnIndex >= order.length) {
    turnIndex = 0;
    round++;
  }
  s = { ...s, combat: { ...combat, order, initiative, turnIndex, round } };
  if (log) s = addLog(s, T(`${c.name} saiu do encontro.`, `${c.name} left the encounter.`));
  if (combat.phase !== 'running') return s;
  if (order.length === 0) return { ...s, combat: emptyCombat() };
  const outcome = checkOutcome(s);
  if (outcome.combat.phase === 'ended') return outcome;
  return wasCurrent ? beginTurn(s, ctx) : s;
}

function placeToken(
  state: EncounterState,
  id: string,
  pos: { x: number; y: number },
): EncounterState {
  const c = creatureOf(state, id);
  const blocked = occupiedCells(state, (o) => o.id !== id);
  if (!canStand(state.map, pos, sizeOf(c), blocked))
    throw new RuleError(
      T(
        'Não cabe aí (parede, borda ou outra criatura).',
        "It doesn't fit there (wall, edge or another creature).",
      ),
    );
  const existing = tokenOf(state, id);
  const tokens = existing
    ? state.tokens.map((t) => (t.creatureId === id ? { ...t, pos } : t))
    : [...state.tokens, { creatureId: id, pos }];
  return { ...state, tokens };
}

function rollInitiative(state: EncounterState, rng: Rng): EncounterState {
  if (state.combat.phase === 'running')
    throw new RuleError(T('O combate já começou.', 'Combat has already started.'));
  const initiative: Record<string, number> = {};
  const parts: string[] = [];
  for (const c of state.creatures) {
    if (!tokenOf(state, c.id)) continue;
    const r = rollD20(initiativeBonus(c), 'normal', rng);
    initiative[c.id] = r.roll.total;
    parts.push(`${c.name} ${r.roll.total}`);
  }
  if (!parts.length)
    throw new RuleError(
      T(
        'Coloque criaturas no mapa antes de rolar a iniciativa.',
        'Place creatures on the map before rolling initiative.',
      ),
    );
  return addLog(
    { ...state, combat: { ...state.combat, phase: 'setup', initiative } },
    T(`Iniciativa: ${parts.join(', ')}.`, `Initiative: ${parts.join(', ')}.`),
  );
}

// ---------- combate ----------

function startCombat(state: EncounterState, ctx: Context): EncounterState {
  if (state.combat.phase === 'running')
    throw new RuleError(T('O combate já começou.', 'Combat has already started.'));
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
  if (order.length === 0)
    throw new RuleError(
      T('Role a iniciativa antes de começar.', 'Roll initiative before starting.'),
    );
  // invocações agem logo depois de quem as invocou, qualquer que seja o desempate
  const owned = (id: string) => state.creatures.find((c) => c.id === id)?.summon?.by;
  const grouped = order.filter((id) => !(owned(id) && order.includes(owned(id)!)));
  for (const id of order.filter((x) => owned(x) && order.includes(owned(x)!))) {
    let at = grouped.indexOf(owned(id)!);
    while (grouped[at + 1] && owned(grouped[at + 1]) === owned(id)) at++;
    grouped.splice(at + 1, 0, id);
  }
  order.splice(0, order.length, ...grouped);

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
  s = addLog(s, T('O combate começou.', 'Combat started.'));
  // se o primeiro da ordem já está morto, pula para o próximo vivo
  return creatureOf(s, order[0]).status === 'dead' ? advanceTurn(s, ctx) : beginTurn(s, ctx);
}

/** Entra num combate em andamento: rola iniciativa e se encaixa na ordem sem mudar de quem é a vez. */
function joinCombat(state: EncounterState, id: string, rng: Rng): EncounterState {
  const c = creatureOf(state, id);
  const { combat } = state;
  if (combat.phase !== 'running' || !combat.turn)
    throw new RuleError(T('O combate não está em andamento.', 'Combat is not in progress.'));
  if (combat.order.includes(id))
    throw new RuleError(
      T(`${c.name} já está na iniciativa.`, `${c.name} is already in the initiative.`),
    );
  if (!tokenOf(state, id))
    throw new RuleError(
      T(`Coloque ${c.name} no mapa primeiro.`, `Place ${c.name} on the map first.`),
    );

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
  return addLog(
    next,
    T(
      `${c.name} entra no combate com iniciativa ${r.roll.total}.`,
      `${c.name} joins combat with initiative ${r.roll.total}.`,
    ),
    [id],
  );
}

const DEATH_OUTCOME: Record<string, [string, string]> = {
  success: ['sucesso', 'success'],
  failure: ['falha', 'failure'],
  'critical-failure': ['falha crítica', 'critical failure'],
  revived: ['volta à consciência', 'regains consciousness'],
  stable: ['estabilizou', 'stabilized'],
  dead: ['morreu', 'died'],
};

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
function beginTurn(state: EncounterState, ctx: Context): EncounterState {
  const actor = creatureOf(state, state.combat.order[state.combat.turnIndex]);
  const s: EncounterState = {
    ...state,
    combat: {
      ...state.combat,
      turn: actor.form?.noActions
        ? { ...newTurn(actor.id), action: false, bonus: false, reaction: false }
        : newTurn(actor.id),
      dodging: state.combat.dodging.filter((id) => id !== actor.id),
      helped: (state.combat.helped ?? []).filter((h) => h.by !== actor.id),
      reactionUsed: (state.combat.reactionUsed ?? []).filter((id) => id !== actor.id),
      sneakUsed: [],
    },
  };
  return beginUpkeep(
    addLog(
      s,
      T(
        `Turno de ${actor.name} (rodada ${s.combat.round}).`,
        `${actor.name}'s turn (round ${s.combat.round}).`,
      ),
      [actor.id],
    ),
    actor.id,
    ctx,
  );
}

function advanceTurn(state: EncounterState, ctx: Context): EncounterState {
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
  const base = { ...state, combat: { ...state.combat, turnIndex, round } };
  return beginTurn(round > state.combat.round ? tickZones(base) : base, ctx);
}

/**
 * Consulta de movimento da criatura na vez: a mesma usada para validar `move`
 * e para a interface destacar as células alcançáveis.
 */
/** O modo de quem não escolheu: voa quem voa, senão anda. */
export const defaultMoveKind = (c: Creature): MoveKind => (c.speeds?.fly ? 'fly' : 'walk');

/** Modo e velocidade de movimento: etéreo atravessa tudo; senão o que a ficha permite (voa por padrão quem voa). */
export function movementMode(
  actor: Creature,
  requested?: MoveKind,
): { mode: MoveMode; speed: number } {
  const sp = actor.speeds ?? {};
  const base = (n: number) => effectiveSpeedOf(actor, n);
  if (actor.plane === 'ethereal')
    return { mode: 'phase', speed: base(Math.max(actor.speed, sp.fly ?? 0)) };
  const kind = requested ?? (sp.fly ? 'fly' : 'walk');
  if (kind === 'fly' && sp.fly) return { mode: 'fly', speed: base(sp.fly) };
  if (kind === 'swim' && sp.swim) return { mode: 'swim', speed: base(sp.swim) };
  if (kind === 'climb' && sp.climb) return { mode: 'walk', speed: base(sp.climb) };
  if (kind === 'burrow' && sp.burrow) return { mode: 'phase', speed: base(sp.burrow) };
  return { mode: 'walk', speed: base(actor.speed) };
}

export function moveQuery(state: EncounterState, actorId: string, requested?: MoveKind): MoveQuery {
  const { actor, turn } = actorTurn(state, actorId);
  const from = tokenOf(state, actorId);
  if (!from)
    throw new RuleError(T(`${actor.name} não está no mapa.`, `${actor.name} is not on the map.`));
  const { mode, speed } = movementMode(actor, requested);
  const remaining = speed * (turn.dashed ? 2 : 1) - turn.movedFt;
  if (remaining <= 0) throw new RuleError(T('Sem deslocamento restante.', 'No movement left.'));
  return {
    map: state.map,
    start: from.pos,
    size: sizeOf(actor),
    budgetFt: remaining,
    // atravessa aliados, mas não hostis (etéreo e escavar atravessam todos)
    blocked: occupiedCells(state, (o) => teamOf(o) !== teamOf(actor)),
    rule: state.rule,
    mode,
  };
}

/** Quem tem `grappleLocks` não ataca enquanto mantém alguém agarrado. */
function assertCanAttack(state: EncounterState, actor: Creature): void {
  if (
    allMods(actor).some((m) => m.grappleLocks) &&
    state.creatures.some((c) =>
      c.conditions.some((k) => k.name === 'grappled' && k.by === actor.id),
    )
  )
    throw new RuleError(
      T(
        `${actor.name} não ataca enquanto mantém alguém agarrado.`,
        `${actor.name} cannot attack while holding a grapple.`,
      ),
    );
}

/** Estaca no Coração: o vampiro incapacitado fica paralisado até tirarem a estaca; a cria de vampiro é destruída. */
function stake(state: EncounterState, id: string, remove: boolean): EncounterState {
  const c = creatureOf(state, id);
  const mode = allMods(c).find((m) => m.stake)?.stake;
  if (!mode)
    throw new RuleError(
      T(`${c.name} não é afetado pela estaca.`, `${c.name} is not affected by a stake.`),
    );
  if (remove) {
    const s = withCreature(state, removeCondition(c, 'paralyzed'));
    return addLog(
      s,
      T(`A estaca é retirada de ${c.name}.`, `The stake is removed from ${c.name}.`),
      [id],
    );
  }
  const down =
    c.status === 'dying' ||
    c.status === 'stable' ||
    c.conditions.some(
      (k) => k.name === 'incapacitated' || k.name === 'paralyzed' || k.name === 'unconscious',
    );
  if (!down)
    throw new RuleError(
      T(
        `${c.name} precisa estar incapacitado para receber a estaca.`,
        `${c.name} must be incapacitated to take the stake.`,
      ),
    );
  if (mode === 'destroy')
    return addLog(
      withCreature(state, { ...c, status: 'dead', hp: { ...c.hp, current: 0 } }),
      T(
        `${c.name} é destruído pela estaca no coração.`,
        `${c.name} is destroyed by the stake through its heart.`,
      ),
      [id],
    );
  return addLog(
    withCreature(state, addCondition(c, 'paralyzed', 0, { spell: 'Estaca no Coração' })),
    T(
      `${c.name} fica paralisado pela estaca no coração.`,
      `${c.name} is paralyzed by the stake through its heart.`,
    ),
    [id],
  );
}

function move(
  state: EncounterState,
  actorId: string,
  to: { x: number; y: number },
  ctx: Context,
  kind?: MoveKind,
): EncounterState {
  const rng = ctx.rng;
  const { actor, turn } = actorTurn(state, actorId);
  const q = moveQuery(state, actorId, kind);
  // Proibição: não entra numa moradia sem ser convidado
  if (allMods(actor).some((m) => m.forbiddance)) {
    const room = (state.map.rooms ?? []).find(
      (r) =>
        r.residence &&
        !(r.invited ?? []).includes(actorId) &&
        footprint(to, q.size).some(
          (p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h,
        ),
    );
    if (room)
      throw new RuleError(
        T(
          `${actor.name} não pode entrar em ${room.name} sem convite.`,
          `${actor.name} cannot enter ${room.name} without an invitation.`,
        ),
      );
  }
  // não pode terminar sobre ninguém (nem dentro de parede, mesmo atravessando)
  const anyone = occupiedCells(state, (o) => o.id !== actorId);
  if (!canStand(state.map, to, q.size, anyone))
    throw new RuleError(T('Destino bloqueado ou ocupado.', 'Destination is blocked or occupied.'));
  const found = findPath(q, to);
  if (!found) throw new RuleError(T('Fora do alcance de deslocamento.', 'Out of movement range.'));

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
    T(`${actor.name} se moveu ${distT(cost)}.`, `${actor.name} moved ${distT(cost)}.`),
    [actorId],
  );
  const queued = turn.disengaged ? s : queueOpportunities(s, actorId, q.start, stop);
  const entered = alertsAfterMove(
    enterZones(queued, actorId, q.start, ctx),
    actorId,
    q.start,
    stop,
  );
  return hit ? triggerTrap(entered, actorId, hit.trap.id, rng) : entered;
}

/** Quem estava ao alcance e deixou de estar (sem Desengajar) dá uma reação a cada inimigo capaz. */
export function queueOpportunities(
  state: EncounterState,
  moverId: string,
  from: Pos,
  to: Pos,
): EncounterState {
  const mover = creatureOf(state, moverId);
  if (allMods(mover).some((m) => m.noOpportunity)) return state;
  const pending = [...(state.combat.pending ?? [])];
  let seq = pending.reduce((n, p) => Math.max(n, p.id), 0);
  for (const t of state.tokens) {
    const h = creatureOf(state, t.creatureId);
    if (teamOf(h) === teamOf(mover) || !canAct(h) || hasNoReactions(h)) continue;
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
    T(
      `${mover.name} saiu do alcance de ${names}: ataque de oportunidade possível.`,
      `${mover.name} left ${names}'s reach: opportunity attack possible.`,
    ),
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
  const p = pending.find(
    (x: PendingReaction) => x.reactorId === reactorId && x.kind === 'opportunity',
  );
  if (!p)
    throw new RuleError(
      T('Não há reação pendente para essa criatura.', 'No pending reaction for that creature.'),
    );
  const rest = { ...state, combat: { ...state.combat, pending: pending.filter((x) => x !== p) } };
  const reactor = creatureOf(state, reactorId);
  if (!use)
    return addLog(
      rest,
      T(
        `${reactor.name} recusa o ataque de oportunidade.`,
        `${reactor.name} declines the opportunity attack.`,
      ),
      [reactorId],
    );

  const target = creatureOf(state, p.targetId);
  if (!canAct(reactor))
    throw new RuleError(
      T(`${reactor.name} não pode reagir agora.`, `${reactor.name} cannot react now.`),
    );
  if (target.status === 'dead')
    return addLog(
      rest,
      T(`${reactor.name}: o alvo já está morto.`, `${reactor.name}: the target is already dead.`),
      [reactorId],
    );
  const used = {
    ...rest,
    combat: { ...rest.combat, reactionUsed: [...(rest.combat.reactionUsed ?? []), reactorId] },
  };
  const announced = addLog(
    used,
    T(
      `${reactor.name} usa a reação: ataque de oportunidade contra ${target.name}.`,
      `${reactor.name} uses a reaction: opportunity attack against ${target.name}.`,
    ),
    [reactorId, target.id],
  );
  return strike(announced, reactor, target, p.attackIndex, p.reach, [], rng);
}

/**
 * Habilidade que é um ataque de arma comum do monstro (Ataque de Cauda lendário, mordida com ação
 * bônus): paga o custo da habilidade e resolve o golpe como qualquer outro.
 */
function abilityStrike(
  state: EncounterState,
  cmd: Extract<Command, { type: 'cast' }>,
  sp: Spell,
  ctx: Context,
): EncounterState {
  const ab = sp.ability!;
  const actor = creatureOf(state, cmd.actorId);
  const index = actor.attacks.findIndex((a) => a.name === ab.attack);
  if (index < 0)
    throw new RuleError(
      T(
        `${actor.name} não tem o ataque ${ab.attack}.`,
        `${actor.name} has no ${ab.attack} attack.`,
      ),
    );
  const targetId = cmd.targetId ?? cmd.targetIds?.[0];
  if (!targetId) throw new RuleError(T('Escolha um alvo.', 'Choose a target.'));
  const target = creatureOf(state, targetId);
  if (target.id === actor.id)
    throw new RuleError(T('Não é possível atacar a si mesmo.', 'You cannot attack yourself.'));
  if (target.status === 'dead')
    throw new RuleError(T(`${target.name} já está morto.`, `${target.name} is already dead.`));
  if (!samePlane(actor, target)) throw planeError();
  assertCanAttack(state, actor);
  const from = tokenOf(state, actor.id);
  const at = tokenOf(state, target.id);
  if (!from || !at) throw new RuleError(T('Criatura fora do mapa.', 'Creature is off the map.'));
  const weapon = actor.attacks[index];
  const dist = distanceFt(from.pos, sizeOf(actor), at.pos, sizeOf(target), state.rule);
  if (dist > weapon.range)
    throw new RuleError(
      T(
        `Alvo fora de alcance (${distT(dist)}; alcance ${distT(weapon.range)}).`,
        `Target out of range (${distT(dist)}; range ${distT(weapon.range)}).`,
      ),
    );
  let s = state;
  if (ab.cost === 'legendary') legendaryGate(state, actor, sp);
  else {
    const { turn } = actorTurn(state, actor.id);
    abilityReady(actor, sp);
    if (ab.cost === 'bonus') {
      if (!turn.bonus)
        throw new RuleError(
          T('Sem ação bônus disponível neste turno.', 'No bonus action left this turn.'),
        );
      s = setTurn(s, { ...turn, bonus: false });
    } else if (ab.cost === 'action') {
      spendAction(turn);
      s = setTurn(s, { ...turn, action: false });
    }
  }
  s = payAbility(s, actor.id, sp);
  s = addLog(s, T(`${actor.name} usa ${sp.name}.`, `${actor.name} uses ${spellName(sp)}.`), [
    actor.id,
  ]);
  return attachFx(
    s,
    strike(s, creatureOf(s, actor.id), target, index, dist, [], ctx.rng),
    attackFx(s, actor.id, target.id, weapon.range, weapon.type, weapon.name),
  );
}

/** Resolve o ataque e pendura o efeito visual (talho ou flecha) na primeira linha nova do registro. */
function attack(
  state: EncounterState,
  cmd: Extract<Command, { type: 'attack' }>,
  ctx: Context,
): EncounterState {
  const next = resolveAttack(state, cmd, ctx);
  const w = creatureOf(state, cmd.actorId).attacks[cmd.attackIndex];
  return attachFx(state, next, attackFx(state, cmd.actorId, cmd.targetId, w.range, w.type, w.name));
}

function resolveAttack(
  state: EncounterState,
  cmd: Extract<Command, { type: 'attack' }>,
  ctx: Context,
): EncounterState {
  const { actor, turn } = actorTurn(state, cmd.actorId);
  const weapon = actor.attacks[cmd.attackIndex];
  if (!weapon) throw new RuleError(T('Ataque inexistente.', 'No such attack.'));
  if (!attackAllowed(actor, weapon.name))
    throw new RuleError(
      T(
        `${weapon.name} não vale na forma atual.`,
        `${weapon.name} does not work in the current form.`,
      ),
    );
  const target = creatureOf(state, cmd.targetId);
  if (!samePlane(actor, target)) throw planeError();
  assertCanAttack(state, actor);
  if (target.id === actor.id)
    throw new RuleError(T('Não é possível atacar a si mesmo.', 'You cannot attack yourself.'));
  if (target.status === 'dead')
    throw new RuleError(T(`${target.name} já está morto.`, `${target.name} is already dead.`));

  const from = tokenOf(state, actor.id);
  const at = tokenOf(state, target.id);
  if (!from || !at) throw new RuleError(T('Criatura fora do mapa.', 'Creature is off the map.'));
  if (ctx.role.kind === 'player' && at.hidden)
    throw new RuleError(T('Alvo não visível.', 'Target not visible.'));
  const dist = distanceFt(from.pos, sizeOf(actor), at.pos, sizeOf(target), state.rule);
  if (dist > weapon.range)
    throw new RuleError(
      T(
        `Alvo fora de alcance (${distT(dist)}; alcance ${distT(weapon.range)}).`,
        `Target out of range (${distT(dist)}; range ${distT(weapon.range)}).`,
      ),
    );

  // ação: o 1º ataque gasta a ação Atacar; Ataque Extra usa os restantes
  let attacksLeft = turn.attacksLeft;
  let action = turn.action;
  if (attacksLeft > 0) attacksLeft--;
  else if (action) {
    action = false;
    attacksLeft = Math.max(0, actor.attacksPerAction - 1);
  } else throw new RuleError(T('Sem ação disponível neste turno.', 'No action left this turn.'));

  const extra: AdvMode[] = [cmd.mode ?? 'normal'];
  if (from.hidden) extra.push('advantage');
  if (state.combat.dodging.includes(target.id)) extra.push('disadvantage');
  return revealToken(
    strike(
      setTurn(state, { ...turn, action, attacksLeft }),
      actor,
      target,
      cmd.attackIndex,
      dist,
      extra,
      ctx.rng,
      cmd.knockOut,
    ),
    actor.id,
  );
}

const revealToken = (state: EncounterState, id: string): EncounterState => ({
  ...state,
  tokens: state.tokens.map((token) =>
    token.creatureId === id ? { ...token, hidden: false } : token,
  ),
});

/** Rola um ataque já validado (alcance, ação): condições, crítico, dano e concentração. */
function strike(
  state: EncounterState,
  actor: Creature,
  target: Creature,
  attackIndex: number,
  dist: number,
  extra: AdvMode[],
  rng: Rng,
  knockOut = false,
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
  // Táticas de Matilha e Frenesi Sanguinário (traços de monstros)
  const tmods = allMods(actor);
  if (tmods.some((m) => m.packTactics) && allyAdjacent(state, actor, target))
    modes.push('advantage');
  if (tmods.some((m) => m.bloodFrenzy) && target.hp.current < target.hp.max)
    modes.push('advantage');
  if (sunPenalty(state, actor)) modes.push('disadvantage');
  const cond = attackModifiers(actor, target, dist, weapon.range > 5);
  const helped = consumeHelp(state, target.id);
  state = helped.state;
  const extraRoll = attackExtra(state, actor.id, rng);
  state = consumeAttacked(extraRoll.state, target.id);
  const mode = combineModes([...modes, ...helped.modes, ...cond.modes]);
  const at = tokenOf(state, target.id)!;
  const cover = coverBonus(state, from.pos, at.pos);
  const ac = effectiveAc(target) + cover;
  const magic = weaponBonus(actor);
  state = keepRage(state, actor.id);

  const d20 = rollD20(weapon.bonus + magic, mode, rng);
  const total = d20.roll.total + extraRoll.bonus;
  const hit = d20.crit || (!d20.fumble && total >= ac);
  const crit = hit && (d20.crit || cond.autoCrit);
  const decoyed = decoy(state, target.id, total, rng, hit);
  if (decoyed) return dropOnAttack(decoyed, actor.id);
  let head = T(
    `${actor.name} atacou ${target.name} com ${weapon.name}: d20 ${d20.natural} ${fmt(weapon.bonus + magic)}${extraRoll.text} = ${total} vs CA ${ac}${cover ? ` (cobertura +${cover})` : ''}` +
      (mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)'),
    `${actor.name} attacked ${target.name} with ${weapon.name}: d20 ${d20.natural} ${fmt(weapon.bonus + magic)}${extraRoll.text} = ${total} vs AC ${ac}${cover ? ` (cover +${cover})` : ''}` +
      (mode === 'normal' ? '' : mode === 'advantage' ? ' (advantage)' : ' (disadvantage)'),
  );
  if (!hit)
    return dropOnAttack(
      addLog(state, T(`${head} — erro.`, `${head} — miss.`), [actor.id, target.id]),
      actor.id,
    );

  const expr = parseDice(weapon.damage);
  const dmg = roll(crit ? criticalExpr(expr) : expr, rng);
  const minus = damageDieTotal(actor, rng);
  let amount = Math.max(0, dmg.total + magic + minus.total);
  if (weapon.range <= 5 && effectsOf(actor).some((e) => e.mods.halfWeaponDamage))
    amount = Math.floor(amount / 2);
  if (weapon.range <= 5) amount += meleeDamageBonus(actor);
  const parts = [{ amount, type: weapon.type as string }];
  const sneak = sneakAttack(state, actor, target, weapon, mode);
  if (sneak) {
    const sexpr = parseDice(sneak);
    parts.push({
      amount: Math.max(0, roll(crit ? criticalExpr(sexpr) : sexpr, rng).total),
      type: weapon.type as string,
    });
    state = markSneak(state, actor.id);
    head = T(`${head} (Ataque Furtivo ${sneak})`, `${head} (Sneak Attack ${sneak})`);
  }
  for (const rider of weaponRiders(actor, target.id)) {
    const rexpr = parseDice(rider.dice);
    const extra = roll(crit ? criticalExpr(rexpr) : rexpr, rng);
    parts.push({
      amount: Math.max(0, extra.total),
      type: rider.type === 'weapon' ? weapon.type : rider.type,
    });
  }
  // monstro: o ataque traz dano extra ou uma salvaguarda (mordida envenenada, agarrar…)
  const moved = state.combat.turn?.actorId === actor.id ? state.combat.turn.movedFt : 0;
  const found = riderOf(actor, weapon.name);
  // Investida/Bote: só vale se o monstro se moveu o bastante antes do golpe
  const monsterRider = found && (found.ability?.moveFt ?? 0) > moved ? undefined : found;
  if (monsterRider?.damage || monsterRider?.extraDamage) {
    for (const p of damageParts(monsterRider)) {
      const rexpr = parseDice(p.dice);
      parts.push({
        amount: Math.max(0, roll(crit ? criticalExpr(rexpr) : rexpr, rng).total),
        type: p.type,
      });
    }
  }
  // Vantagem Marcial (monstro): dano extra uma vez por turno com aliado ao lado do alvo
  const bonusDice = tmods.find((m) => m.allyBonus)?.allyBonus;
  if (
    bonusDice &&
    !(state.combat.sneakUsed ?? []).includes(actor.id) &&
    allyAdjacent(state, actor, target)
  ) {
    const bexpr = parseDice(bonusDice.dice);
    parts.push({
      amount: Math.max(0, roll(crit ? criticalExpr(bexpr) : bexpr, rng).total),
      type: weapon.type as string,
    });
    state = markSneak(state, actor.id);
  }
  const onHit = effectsOf(actor).flatMap((e) =>
    e.mods.once && e.mods.onHit
      ? [
          {
            spell: e.name,
            by: e.by,
            ...(e.concentration ? { concentration: true } : {}),
            spec: e.mods.onHit,
          },
        ]
      : [],
  );
  return holdOrApply(
    consumeWeaponRiders(state, actor.id),
    {
      attackerId: actor.id,
      ...(onHit.length ? { onHit } : {}),
      targetId: target.id,
      head,
      total,
      ac,
      nat20: d20.crit,
      crit,
      parts,
      ...(weapon.range <= 5 ? { melee: true } : {}),
      ...(monsterRider
        ? {
            rider: {
              spellId: monsterRider.id,
              slot: 0,
              dc: monsterRider.ability?.dc ?? 10,
              ability: 'str',
            },
          }
        : {}),
      ...(knockOut && weapon.range <= 5 ? { knockOut: true } : {}),
    },
    rng,
  );
}
