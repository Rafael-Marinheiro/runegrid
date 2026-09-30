import { Ability, Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Spell } from '../../models/spell';
import {
  abilityMod,
  addEffect,
  applyDamage,
  attackModifiers,
  autoFailsSave,
  effectiveAc,
  heal,
  proficiencyBonus,
  RuleError,
  saveBonus,
  spellSaveDc,
  spendSlot,
} from '../creature';
import { AdvMode, criticalExpr, parseDice, roll, rollD20, Rng } from '../dice';
import { inSphere } from '../grid/area';
import { canStand, distanceFt } from '../grid/movement';
import { getSpell } from '../spells/data';
import {
  damageParts,
  flatHeal,
  healExpression,
  partExpression,
  rayCount,
  scaleDice,
} from '../spells/scaling';
import { Command } from './commands';
import { consumeHelp, coverBonus } from './cover';
import { attachFx, spellFx } from './fx';
import { holdOrApply } from './hits';
import { offerCast } from './reactions';
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
} from './helpers';
import { applyRiders, makeEffect } from './rider';
import { attackExtra, consumeAttacked, decoy, dropOnAttack, saveExtra } from './rolls';
import { addLog, creatureOf, occupiedCells, sizeOf, teamOf, tokenOf, withCreature } from './state';
import { createZone, inArea, zoneContains } from './zones';

const LEVEL = (n: number) => (n === 0 ? 'truque' : `${n}º nível`);

type CastCmd = Extract<Command, { type: 'cast' }>;

/** Quem a magia atinge: os alvos escolhidos ou as criaturas dentro da área. */
export function affectedBy(
  state: EncounterState,
  spell: Spell,
  caster: Creature,
  cmd: Pick<CastCmd, 'targetId' | 'targetIds' | 'point'>,
  slot: number,
  role: Context['role'],
) {
  const from = tokenOf(state, caster.id);
  if (!from) throw new RuleError(`${caster.name} não está no mapa.`);
  const t = spell.target;

  if (t.kind === 'self') return { creatures: [caster], dist: 0 };

  if (t.kind === 'creature') {
    const ids = [...new Set(cmd.targetIds ?? (cmd.targetId ? [cmd.targetId] : []))];
    if (!ids.length) throw new RuleError('Escolha um alvo.');
    const max = (t.max ?? 1) + (t.perLevel ?? 0) * Math.max(0, slot - spell.level);
    if (ids.length > max)
      throw new RuleError(`${spell.name} atinge no máximo ${max} alvo(s) com este espaço.`);
    const creatures = ids.map((id) => {
      const target = creatureOf(state, id);
      const at = tokenOf(state, target.id);
      if (!at) throw new RuleError(`${target.name} não está no mapa.`);
      if (role.kind === 'player' && at.hidden) throw new RuleError('Alvo não visível.');
      if (target.status === 'dead' && !spell.heal && !spell.revive)
        throw new RuleError(`${target.name} já está morto.`);
      const d = distanceFt(from.pos, sizeOf(caster), at.pos, sizeOf(target), state.rule);
      if (d > spell.range)
        throw new RuleError(`Alvo fora de alcance (${d} ft; alcance ${spell.range} ft).`);
      return target;
    });
    const dist = distanceFt(
      from.pos,
      sizeOf(caster),
      tokenOf(state, creatures[0].id)!.pos,
      sizeOf(creatures[0]),
      state.rule,
    );
    return { creatures, dist };
  }

  const auraOnly = t.kind === 'sphere' && t.self;
  if (!cmd.point && !auraOnly) throw new RuleError('Escolha um ponto no mapa.');
  const point = cmd.point ?? from.pos;
  const inMap =
    point.x >= 0 && point.y >= 0 && point.x < state.map.width && point.y < state.map.height;
  if (!inMap) throw new RuleError('Ponto fora do mapa.');

  if (t.kind === 'point') {
    const d = distanceFt(from.pos, sizeOf(caster), point, 1, state.rule);
    if (d > spell.range)
      throw new RuleError(`Ponto fora de alcance (${d} ft; alcance ${spell.range} ft).`);
    return { creatures: [], dist: 0 };
  }

  const selfOrigin = (t.kind === 'sphere' || t.kind === 'cube') && t.self;
  const creatures = state.tokens.flatMap((tok) => {
    const c = creatureOf(state, tok.creatureId);
    if (c.status === 'dead') return [];
    if (selfOrigin && c.id === caster.id) return [];
    return inArea(state, t, from.pos, sizeOf(caster), point, tok.pos, sizeOf(c)) ? [c] : [];
  });

  if ((t.kind === 'sphere' || t.kind === 'cube') && !t.self) {
    const dist = distanceFt(from.pos, sizeOf(caster), point, 1, state.rule);
    if (dist > spell.range)
      throw new RuleError(`Ponto fora de alcance (${dist} ft; alcance ${spell.range} ft).`);
  }
  return { creatures, dist: 0 };
}

/** Conjura uma magia: valida, gasta ação e espaço, e resolve o efeito. */
export function cast(state: EncounterState, cmd: CastCmd, ctx: Context): EncounterState {
  const spell = getSpell(cmd.spellId, cmd.ruleset);
  const known = (id: string) => {
    const who = creatureOf(state, cmd.actorId);
    return who.spellcasting?.spells.includes(id) || who.sustained?.some((x) => x.spellId === id);
  };
  if (!spell || !known(spell.id)) {
    throw new RuleError(`${creatureOf(state, cmd.actorId).name} não conhece essa magia.`);
  }
  const sustain = cmd.sustain === true;
  if (sustain && !spell.sustain) throw new RuleError(`${spell.name} não se repete a cada turno.`);
  if (!sustain && spell.castTime === 'reaction')
    throw new RuleError('Magia de reação: use-a como reação quando o gatilho acontecer.');

  const long = !sustain && spell.castTime === 'long';
  if (long && state.combat.phase === 'running')
    throw new RuleError(`${spell.name} leva mais de uma ação para conjurar: fora do combate.`);
  const { actor, turn } = long
    ? { actor: creatureOf(state, cmd.actorId), turn: null }
    : actorTurn(state, cmd.actorId);

  const kept = actor.sustained?.find((x) => x.spellId === spell.id);
  if (sustain && !kept) throw new RuleError(`${actor.name} não está mantendo ${spell.name}.`);
  const slotLevel = sustain
    ? kept!.slotLevel
    : spell.level === 0
      ? 0
      : (cmd.slotLevel ?? spell.level);
  if (slotLevel < spell.level || slotLevel > 9) throw new RuleError('Espaço de magia inválido.');

  const cost = sustain ? spell.sustain!.cost : spell.castTime === 'bonus' ? 'bonus' : 'action';
  if (turn) {
    if (cost === 'action' && !turn.action) throw new RuleError('Sem ação disponível neste turno.');
    if (cost === 'bonus' && !turn.bonus)
      throw new RuleError('Sem ação bônus disponível neste turno.');
  }

  // na repetição, vale o que a magia muda (alvo, dano) sobre a conjuração original
  const use: Spell = withOption(
    sustain ? { ...spell, ...spell.sustain!.use } : spell,
    cmd.option ?? kept?.option,
  );
  // repetir só para mover a área (Esfera Flamejante, Raio de Lua, Lufada de Vento)
  const moveOnly =
    sustain && !!spell.zone && !!cmd.point && !cmd.targetId && !cmd.targetIds?.length;
  const targets = moveOnly ? [] : affectedBy(state, use, actor, cmd, slotLevel, ctx.role).creatures;

  // gasta espaço de magia e troca a concentração
  let caster = slotLevel > 0 && !sustain ? spendSlot(actor, slotLevel) : actor;
  let s = state;
  if (!sustain && spell.concentration) {
    if (caster.concentration)
      s = addLog(s, `${caster.name} deixa de se concentrar em ${caster.concentration}.`, [
        caster.id,
      ]);
    caster = { ...caster, concentration: spell.name };
  }
  if (!sustain && spell.sustain && !spell.grantSustain) {
    caster = {
      ...caster,
      sustained: [
        ...(caster.sustained ?? []).filter((x) => x.spellId !== spell.id),
        {
          spellId: spell.id,
          slotLevel,
          ...(spell.rounds ? { rounds: spell.rounds } : {}),
          ...(cmd.option ? { option: cmd.option } : {}),
        },
      ],
    };
  }
  s = withCreature(s, caster);
  if (turn) {
    s = setTurn(s, {
      ...turn,
      action: cost === 'action' ? false : turn.action,
      bonus: cost === 'bonus' ? false : turn.bonus,
    });
  }
  const upcast = slotLevel > spell.level ? ` (${LEVEL(slotLevel)})` : '';
  const before = s;
  s = addLog(
    s,
    sustain
      ? `${caster.name} usa ${spell.name} de novo.`
      : `${caster.name} conjura ${spell.name}${upcast}.`,
    [caster.id],
  );
  s = attachFx(
    before,
    s,
    spellFx(
      s,
      use,
      slotLevel,
      caster.id,
      targets.map((t) => t.id),
      cmd.point,
    ),
  );
  if (spell.narrative) s = addLog(s, narrativeNote(spell), [caster.id]);
  if (spell.manual) s = addLog(s, `${spell.name}: ${spell.manual}`, [caster.id]);
  if (moveOnly) return moveZone(s, caster, spell, cmd.point!, slotLevel, ctx, cmd.ruleset);
  // alguém pode reagir à conjuração (Contrafeitiço): a resolução espera a decisão
  if (!sustain) {
    const held = offerCast(s, caster.id, spell, slotLevel, JSON.stringify(cmd));
    if (held) return held;
  }
  return finishCast(s, cmd, ctx);
}

/** Resolve a conjuração já paga (ação, espaço e concentração gastos): efeito e área que fica no mapa. */
export function finishCast(state: EncounterState, cmd: CastCmd, ctx: Context): EncounterState {
  const spell = getSpell(cmd.spellId, cmd.ruleset)!;
  const caster = creatureOf(state, cmd.actorId);
  const sustain = cmd.sustain === true;
  const kept = caster.sustained?.find((x) => x.spellId === spell.id);
  const slotLevel = sustain
    ? (kept?.slotLevel ?? spell.level)
    : spell.level === 0
      ? 0
      : (cmd.slotLevel ?? spell.level);
  const use: Spell = withOption(
    sustain ? { ...spell, ...spell.sustain!.use } : spell,
    cmd.option ?? kept?.option,
  );
  const { creatures: targets, dist } = affectedBy(state, use, caster, cmd, slotLevel, ctx.role);
  // quem usa a repetição pode não ser quem conjurou (Sopro do Dragão): a CD é de quem conjurou
  const dcFrom = kept?.by ? state.creatures.find((c) => c.id === kept.by) : undefined;
  let done = resolveSpell(
    state,
    caster,
    use,
    slotLevel,
    targets,
    dist,
    ctx,
    cmd,
    sustain ? 'sustain' : 'cast',
    dcFrom,
  );
  if (spell.grantSustain && !sustain) {
    for (const t of targets) {
      const cur = creatureOf(done, t.id);
      done = withCreature(done, {
        ...cur,
        sustained: [
          ...(cur.sustained ?? []).filter((x) => x.spellId !== spell.id),
          {
            spellId: spell.id,
            slotLevel,
            by: caster.id,
            ...(spell.rounds ? { rounds: spell.rounds } : {}),
            ...(cmd.option ? { option: cmd.option } : {}),
          },
        ],
      });
    }
  }
  return checkOutcome(
    spell.zone && !sustain
      ? createZone(
          done,
          spell,
          slotLevel,
          caster.id,
          cmd.point ?? tokenOf(done, caster.id)!.pos,
          cmd.ruleset,
        )
      : done,
  );
}

/** A escolha feita ao lançar (primeira opção se nenhuma for dita) substitui campos da magia. */
export function withOption(spell: Spell, option?: string): Spell {
  const o = spell.options?.find((x) => x.id === option) ?? spell.options?.[0];
  return o ? { ...spell, ...o.patch } : spell;
}

const narrativeNote = (spell: Spell): string => `${spell.name}: efeito narrativo, o Mestre conduz.`;

/** Aplica o efeito da magia (ataque, salvaguarda ou automático) aos alvos já escolhidos. */
export function resolveSpell(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  slot: number,
  targets: Creature[],
  dist: number,
  ctx: Context,
  cmd: Pick<CastCmd, 'point' | 'ruleset'>,
  mode: 'cast' | 'sustain' | 'tick' = 'cast',
  dcFrom?: Creature,
): EncounterState {
  let s = state;
  const level = caster.kind === 'monster' ? Math.max(1, Math.ceil(caster.cr ?? 1)) : caster.level;
  const source = dcFrom ?? caster;
  const ability = source.spellcasting?.ability ?? 'int';
  const dc = source.spellcasting ? spellSaveDc(source, ability) : 8;
  const t = spell.target;
  const pointOrigin = (t.kind === 'sphere' || t.kind === 'cube') && !t.self;
  const origin = pointOrigin ? cmd.point : tokenOf(s, caster.id)?.pos;

  if (spell.narrative) return s;
  if (mode !== 'cast' || !spell.noInitial) {
    if (spell.teleport) s = teleport(s, caster, cmd.point);
    else if (
      spell.damage ||
      spell.heal ||
      spell.condition ||
      spell.effect ||
      spell.tempHp ||
      spell.stabilize ||
      spell.cure ||
      spell.dispel ||
      spell.revive ||
      spell.push
    ) {
      if (spell.resolution.kind === 'pool')
        s = spellPool(s, caster, targets, spell, slot, ctx.rng, ability, dc, origin);
      else if (spell.resolution.kind === 'attack') {
        s = spellAttacks(
          s,
          caster,
          targets,
          spell,
          slot,
          level,
          ctx.rng,
          ability,
          dc,
          origin,
          cmd.ruleset,
        );
        if (spell.splash && targets[0])
          s = splashArea(s, caster, targets[0].id, spell, slot, level, ctx.rng, ability, dc);
      } else if (spell.resolution.kind === 'save')
        s = spellSave(s, caster, targets, spell, slot, level, ctx.rng, ability, dc, origin);
      else s = spellAuto(s, caster, targets, spell, slot, level, ctx.rng, ability, dc, origin);
    } else if (
      !spell.push &&
      !spell.zone &&
      targets.length === 0 &&
      spell.target.kind !== 'point'
    ) {
      s = addLog(s, `${spell.name} não atinge ninguém.`, [caster.id]);
    }
  }

  const affected =
    spell.resolution.kind === 'auto' ||
    targets.some((t) => {
      const c = creatureOf(s, t.id);
      return (
        (c.effects ?? []).some((e) => e.spell === spell.id && e.by === caster.id) ||
        c.conditions.some((k) => k.spell === spell.name && k.by === caster.id)
      );
    });
  if (
    mode !== 'tick' &&
    (spell.effect?.to === 'self' || (spell.effect?.to === 'both' && affected))
  ) {
    const eff = makeEffect(spell, caster, slot, dc, ability, targets[0]?.id);
    if (eff) s = withCreature(s, addEffect(creatureOf(s, caster.id), eff));
  }
  if (mode !== 'tick' && (spell.damage || spell.condition)) s = dropOnAttack(s, caster.id);
  return s;
}

function teleport(state: EncounterState, caster: Creature, point?: Pos): EncounterState {
  const tok = tokenOf(state, caster.id);
  if (!tok || !point) throw new RuleError('Escolha o destino.');
  const blocked = occupiedCells(state, (c) => c.id !== caster.id);
  if (!canStand(state.map, point, sizeOf(caster), blocked))
    throw new RuleError('Destino ocupado ou bloqueado.');
  const moved = {
    ...state,
    tokens: state.tokens.map((t) => (t.creatureId === caster.id ? { ...t, pos: point } : t)),
  };
  return addLog(moved, `${caster.name} reaparece em outro ponto do mapa.`, [caster.id]);
}

const adjacentFoe = (state: EncounterState, caster: Creature, pos: Pos): boolean =>
  state.tokens.some((t) => {
    const o = creatureOf(state, t.creatureId);
    return (
      teamOf(o) !== teamOf(caster) &&
      o.status !== 'dead' &&
      distanceFt(pos, sizeOf(caster), t.pos, sizeOf(o), state.rule) <= 5
    );
  });

/** Um ataque de magia por alvo — ou um por raio/dardo (Raios Ardentes, Rajada Mística). */
function spellAttacks(
  state: EncounterState,
  caster: Creature,
  targets: Creature[],
  spell: Spell,
  slot: number,
  level: number,
  rng: Rng,
  ability: Ability,
  dc: number,
  point?: Pos,
  ruleset?: '2014' | '2024',
): EncounterState {
  const rays = spell.damage?.beams || spell.damage?.instances ? rayCount(spell, slot, level) : 1;
  const count = Math.max(rays, targets.length);
  let s = state;
  for (let i = 0; i < count; i++) {
    const t = targets[i % targets.length];
    if (creatureOf(s, t.id).status === 'dead' && count > targets.length) continue;
    const from = tokenOf(s, caster.id)!;
    const at = tokenOf(s, t.id)!;
    const dist = distanceFt(from.pos, sizeOf(caster), at.pos, sizeOf(t), s.rule);
    s = spellAttack(
      s,
      caster,
      t.id,
      spell,
      slot,
      level,
      dist,
      rng,
      ability,
      dc,
      point,
      count > 1 ? i + 1 : 0,
      ruleset,
    );
  }
  return s;
}

function spellAttack(
  state: EncounterState,
  caster: Creature,
  targetId: string,
  spell: Spell,
  slot: number,
  level: number,
  dist: number,
  rng: Rng,
  ability: Ability,
  dc: number,
  point?: Pos,
  ray = 0,
  ruleset?: '2014' | '2024',
): EncounterState {
  const target = creatureOf(state, targetId);
  const bonus = proficiencyBonus(caster) + abilityMod(caster.abilities[ability]);
  const modes: AdvMode[] = [];
  if (state.combat.dodging.includes(target.id)) modes.push('disadvantage');
  const from = tokenOf(state, caster.id)!;
  if (spell.range > 5 && adjacentFoe(state, caster, from.pos)) modes.push('disadvantage');
  const cond = attackModifiers(caster, target, dist, spell.range > 5);
  const helped = consumeHelp(state, target.id);
  state = helped.state;
  const extra = attackExtra(state, caster.id, rng);
  state = consumeAttacked(extra.state, target.id);
  const mode = combineModes([...modes, ...helped.modes, ...cond.modes]);
  const cover = coverBonus(state, from.pos, tokenOf(state, target.id)!.pos);
  const ac = effectiveAc(target) + cover;

  const d20 = rollD20(bonus, mode, rng);
  const total = d20.roll.total + extra.bonus;
  const hit = d20.crit || (!d20.fumble && total >= ac);
  const crit = hit && (d20.crit || cond.autoCrit);
  const label = ray ? `${spell.name} (raio ${ray})` : spell.name;
  const head = `${label}: d20 ${d20.natural} ${fmt(bonus)}${extra.text} = ${total} vs CA ${ac}${cover ? ` (cobertura +${cover})` : ''}${mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)'}`;
  const mod = abilityMod(caster.abilities[ability]);
  const dec = decoy(state, target.id, total, rng, hit);
  if (dec) return dropOnAttack(dec, caster.id);
  if (!hit) {
    const miss = addLog(state, `${head} — erro.`, [caster.id, target.id]);
    return spell.damage?.missHalf
      ? splash(miss, caster, target.id, spell, slot, level, mod, rng)
      : miss;
  }

  const parts = damageParts(spell).map((p) => {
    const expr = parseDice(partExpression(p, spell.level, slot, level));
    return {
      amount: Math.max(
        0,
        roll(crit ? criticalExpr(expr) : expr, rng).total + (p.addModifier ? mod : 0),
      ),
      type: p.type as string,
    };
  });
  return holdOrApply(
    state,
    {
      attackerId: caster.id,
      targetId: target.id,
      head,
      total,
      ac,
      nat20: d20.crit,
      crit,
      parts,
      rider: {
        spellId: spell.id,
        slot,
        dc,
        ability,
        ...(ruleset ? { ruleset } : {}),
        ...(point ? { point } : {}),
      },
    },
    rng,
  );
}

function spellSave(
  state: EncounterState,
  caster: Creature,
  targets: Creature[],
  spell: Spell,
  slot: number,
  level: number,
  rng: Rng,
  ability: Ability,
  dc: number,
  point?: Pos,
): EncounterState {
  if (targets.length === 0) return addLog(state, `${spell.name} não atinge ninguém.`, [caster.id]);
  const res = spell.resolution as Extract<Spell['resolution'], { kind: 'save' }>;
  // o dano é rolado uma vez para todos (um total por tipo de dano)
  const rolled = damageParts(spell).map((p) => ({
    p,
    total: Math.max(
      0,
      roll(partExpression(p, spell.level, slot, level), rng).total +
        (p.addModifier ? abilityMod(caster.abilities[ability]) : 0),
    ),
  }));
  let s = state;
  for (const original of targets) {
    const t = creatureOf(s, original.id);
    const auto = autoFailsSave(t, res.ability);
    const sv = saveExtra(s, t.id, res.ability, rng);
    s = sv.state;
    const r = rollD20(saveBonus(t, res.ability), sv.mode, rng);
    const total = r.roll.total + sv.bonus;
    const saved = !auto && total >= dc;
    const modeTxt =
      sv.mode === 'normal' ? '' : sv.mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)';
    const head = `${t.name}: salvaguarda de ${res.ability.toUpperCase()} ${auto ? 'falha automática' : `d20 ${r.natural}${sv.text} = ${total}`}${modeTxt} vs CD ${dc} — ${saved ? 'passou' : 'falhou'}`;

    if (rolled.length) {
      let cur = creatureOf(s, t.id);
      const lines: string[] = [];
      let dealtTotal = 0;
      for (const { p, total: dmg } of rolled) {
        const amount = saved ? (res.onSave === 'half' ? Math.floor(dmg / 2) : 0) : dmg;
        const d = applyDamage(cur, amount, { type: p.type });
        cur = d.creature;
        dealtTotal += d.dealt;
        lines.push(`${d.dealt} de dano ${dtype(p.type)}${notes(d)}`);
      }
      s = withCreature(s, cur);
      s = addLog(s, `${head}: ${lines.join(' + ')}.`, [caster.id, t.id]);
      s = aftermath(s, t.id, dealtTotal, rng);
    } else {
      s = addLog(s, `${head}.`, [caster.id, t.id]);
    }
    if (!saved) s = applyRiders(s, caster, t.id, spell, slot, dc, ability, rng, point);
  }
  return checkOutcome(s);
}

function spellAuto(
  state: EncounterState,
  caster: Creature,
  targets: Creature[],
  spell: Spell,
  slot: number,
  level: number,
  rng: Rng,
  ability: Ability,
  dc: number,
  point?: Pos,
): EncounterState {
  let s = state;
  const mod = abilityMod(caster.abilities[ability]);

  // dardos automáticos (Mísseis Mágicos): um dado por dardo, repartidos entre os alvos
  const darts = spell.damage?.instances ? rayCount(spell, slot, level) : 0;
  const perTarget = new Map<string, number>();
  if (darts && spell.damage && targets.length) {
    const expr = partExpression(spell.damage, spell.level, slot, level);
    for (let i = 0; i < darts; i++) {
      const id = targets[i % targets.length].id;
      perTarget.set(id, (perTarget.get(id) ?? 0) + Math.max(0, roll(expr, rng).total));
    }
  }

  for (const original of targets) {
    const t = creatureOf(s, original.id);
    if (spell.revive && t.status === 'dead') {
      s = withCreature(s, {
        ...t,
        status: 'alive',
        hp: { ...t.hp, current: 1 },
        deathSaves: { successes: 0, failures: 0 },
      });
      s = addLog(s, `${t.name} volta à vida com 1 PV.`, [caster.id, t.id]);
      continue;
    }
    if (spell.heal) {
      const amount = Math.max(
        0,
        (spell.heal.dice ? roll(healExpression(spell, slot), rng).total : 0) +
          flatHeal(spell, slot) +
          (spell.heal.addModifier ? mod : 0),
      );
      const healed = heal(t, amount);
      s = withCreature(s, healed);
      s = addLog(s, `${t.name} recupera ${healed.hp.current - t.hp.current} PV.`, [
        caster.id,
        t.id,
      ]);
    } else if (spell.damage) {
      const parts = darts ? [] : damageParts(spell);
      let cur = t;
      const lines: string[] = [];
      let dealtTotal = 0;
      const items = darts
        ? [{ type: spell.damage.type, amount: perTarget.get(t.id) ?? 0 }]
        : parts.map((p) => ({
            type: p.type,
            amount: Math.max(
              0,
              roll(partExpression(p, spell.level, slot, level), rng).total +
                (p.addModifier ? mod : 0),
            ),
          }));
      for (const it of items) {
        const d = applyDamage(cur, it.amount, { type: it.type });
        cur = d.creature;
        dealtTotal += d.dealt;
        lines.push(`${d.dealt} de dano ${dtype(it.type)}${notes(d)}`);
      }
      s = withCreature(s, cur);
      s = addLog(s, `${t.name} sofre ${lines.join(' + ')}.`, [caster.id, t.id]);
      s = aftermath(s, t.id, dealtTotal, rng);
    }
    s = applyRiders(s, caster, t.id, spell, slot, dc, ability, rng, point);
  }
  return checkOutcome(s);
}

/** Reserva de PV (Sono): afeta da criatura com menos PV para a com mais, enquanto a reserva couber. */
function spellPool(
  state: EncounterState,
  caster: Creature,
  targets: Creature[],
  spell: Spell,
  slot: number,
  rng: Rng,
  ability: Ability,
  dc: number,
  point?: Pos,
): EncounterState {
  const res = spell.resolution as Extract<Spell['resolution'], { kind: 'pool' }>;
  const expr =
    res.perLevel && slot > spell.level
      ? `${res.dice}+${scaleDice(res.perLevel, slot - spell.level)}`
      : res.dice;
  let pool = Math.max(0, roll(expr, rng).total);
  let s = addLog(state, `${spell.name}: reserva de ${pool} PV.`, [caster.id]);
  const order = targets
    .filter((t) => t.status === 'alive' && !t.conditions.some((c) => c.name === 'unconscious'))
    .sort((a, b) => a.hp.current - b.hp.current);
  for (const t of order) {
    if (t.hp.current > pool) break;
    pool -= t.hp.current;
    s = applyRiders(s, caster, t.id, spell, slot, dc, ability, rng, point);
  }
  return s;
}

/** Move a área de uma magia mantida: aura e linhas giram em torno do conjurador; as demais andam até o ponto. */
function moveZone(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  point: Pos,
  slot: number,
  ctx: Context,
  ruleset?: '2014' | '2024',
): EncounterState {
  const zones = (state.zones ?? []).map((z) => {
    if (z.casterId !== caster.id || z.spellId !== spell.id) return z;
    const fromCaster = z.aura || z.shape.kind === 'line' || z.shape.kind === 'cone';
    return fromCaster ? { ...z, toward: point } : { ...z, center: point };
  });
  let s = addLog({ ...state, zones }, `${spell.name} se move.`, [caster.id]);
  // Raio de Lua (2024): quem a área alcança ao se mover refaz a salvaguarda
  const zone = zones.find((z) => z.casterId === caster.id && z.spellId === spell.id);
  if (spell.zone?.onMove && zone) {
    for (const t of s.tokens) {
      const c = creatureOf(s, t.creatureId);
      if (c.status === 'dead' || !zoneContains(s, zone, c.id)) continue;
      s = resolveSpell(
        s,
        caster,
        spell,
        slot,
        [c],
        0,
        ctx,
        { point: zone.center, ruleset },
        'tick',
      );
    }
  }
  return s;
}

/** Flecha Ácida errou: o alvo ainda leva metade do dano inicial (sem consequências adicionais). */
function splash(
  state: EncounterState,
  caster: Creature,
  targetId: string,
  spell: Spell,
  slot: number,
  level: number,
  mod: number,
  rng: Rng,
): EncounterState {
  let cur = creatureOf(state, targetId);
  const lines: string[] = [];
  let dealt = 0;
  for (const p of damageParts(spell)) {
    const total =
      roll(partExpression(p, spell.level, slot, level), rng).total + (p.addModifier ? mod : 0);
    const r = applyDamage(cur, Math.floor(Math.max(0, total) / 2), { type: p.type });
    cur = r.creature;
    dealt += r.dealt;
    lines.push(`${r.dealt} de dano ${dtype(p.type)}${notes(r)}`);
  }
  let s = withCreature(state, cur);
  s = addLog(s, `${spell.name} respinga no alvo: ${lines.join(' + ')}.`, [caster.id, targetId]);
  return checkOutcome(aftermath(s, targetId, dealt, rng));
}

/** Explosão depois do ataque (Faca de Gelo): o alvo e quem está a até `radius` ft dele fazem a salvaguarda. */
function splashArea(
  state: EncounterState,
  caster: Creature,
  centerId: string,
  spell: Spell,
  slot: number,
  level: number,
  rng: Rng,
  ability: Ability,
  dc: number,
): EncounterState {
  const sp = spell.splash!;
  const at = tokenOf(state, centerId);
  if (!at) return state;
  const near = state.tokens.flatMap((t) => {
    const c = creatureOf(state, t.creatureId);
    return c.status !== 'dead' && inSphere(at.pos, sp.radius, t.pos, sizeOf(c)) ? [c] : [];
  });
  const pseudo: Spell = {
    ...spell,
    resolution: { kind: 'save', ability: sp.ability, onSave: sp.onSave },
    damage: sp.damage,
    extraDamage: undefined,
    condition: undefined,
    effect: undefined,
    push: undefined,
    splash: undefined,
  };
  return spellSave(state, caster, near, pseudo, slot, level, rng, ability, dc, at.pos);
}
