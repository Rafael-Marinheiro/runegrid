import { Ability, Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Spell } from '../../models/spell';
import {
  abilityMod,
  addCondition,
  applyDamage,
  attackModifiers,
  autoFailsSave,
  heal,
  proficiencyBonus,
  RuleError,
  saveBonus,
  spellSaveDc,
  spendSlot,
} from '../creature';
import { AdvMode, criticalExpr, parseDice, roll, rollD20, Rng } from '../dice';
import { inCone, inSphere } from '../grid/area';
import { distanceFt } from '../grid/movement';
import { getSpell } from '../spells/data';
import { damageExpression, healExpression } from '../spells/scaling';
import { Command } from './commands';
import { consumeHelp, coverBonus } from './cover';
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
import { addLog, creatureOf, sizeOf, teamOf, tokenOf, withCreature } from './state';

const LEVEL = (n: number) => (n === 0 ? 'truque' : `${n}º nível`);

/** Quem a magia atinge: o alvo escolhido ou as criaturas dentro da área. */
function affectedBy(
  state: EncounterState,
  spell: Spell,
  caster: Creature,
  cmd: { targetId?: string; point?: Pos },
  role: Context['role'],
) {
  const from = tokenOf(state, caster.id);
  if (!from) throw new RuleError(`${caster.name} não está no mapa.`);

  if (spell.target.kind === 'creature') {
    if (!cmd.targetId) throw new RuleError('Escolha um alvo.');
    const target = creatureOf(state, cmd.targetId);
    const at = tokenOf(state, target.id);
    if (!at) throw new RuleError(`${target.name} não está no mapa.`);
    if (role.kind === 'player' && at.hidden) throw new RuleError('Alvo não visível.');
    if (target.status === 'dead' && !spell.heal)
      throw new RuleError(`${target.name} já está morto.`);
    const dist = distanceFt(from.pos, sizeOf(caster), at.pos, sizeOf(target), state.rule);
    if (dist > spell.range)
      throw new RuleError(`Alvo fora de alcance (${dist} ft; alcance ${spell.range} ft).`);
    return { creatures: [target], dist };
  }

  if (!cmd.point) throw new RuleError('Escolha um ponto no mapa.');
  const point = cmd.point;
  const inMap =
    point.x >= 0 && point.y >= 0 && point.x < state.map.width && point.y < state.map.height;
  if (!inMap) throw new RuleError('Ponto fora do mapa.');
  const creatures = state.tokens.flatMap((t) => {
    const c = creatureOf(state, t.creatureId);
    if (c.status === 'dead') return [];
    const hit =
      spell.target.kind === 'sphere'
        ? inSphere(point, spell.target.radius, t.pos, sizeOf(c))
        : inCone(
            from.pos,
            sizeOf(caster),
            point,
            (spell.target as { length: number }).length,
            t.pos,
            sizeOf(c),
          );
    return hit ? [c] : [];
  });

  if (spell.target.kind === 'sphere') {
    const dist = distanceFt(from.pos, sizeOf(caster), point, 1, state.rule);
    if (dist > spell.range)
      throw new RuleError(`Ponto fora de alcance (${dist} ft; alcance ${spell.range} ft).`);
  }
  return { creatures, dist: 0 };
}

/** Conjura uma magia: valida, gasta ação e espaço, e resolve o efeito. */
export function cast(
  state: EncounterState,
  cmd: Extract<Command, { type: 'cast' }>,
  ctx: Context,
): EncounterState {
  const { actor, turn } = actorTurn(state, cmd.actorId);
  const spell = getSpell(cmd.spellId);
  if (!spell || !actor.spellcasting?.spells.includes(spell.id)) {
    throw new RuleError(`${actor.name} não conhece essa magia.`);
  }
  if (spell.castTime === 'reaction')
    throw new RuleError('Magias de reação ainda não são suportadas.');
  const slotLevel = spell.level === 0 ? 0 : (cmd.slotLevel ?? spell.level);
  if (slotLevel < spell.level || slotLevel > 9) throw new RuleError('Espaço de magia inválido.');

  const usesAction = spell.castTime === 'action';
  if (usesAction && !turn.action) throw new RuleError('Sem ação disponível neste turno.');
  if (!usesAction && !turn.bonus) throw new RuleError('Sem ação bônus disponível neste turno.');

  const { creatures: targets, dist } = affectedBy(state, spell, actor, cmd, ctx.role);

  // gasta espaço de magia e troca a concentração
  let caster = slotLevel > 0 ? spendSlot(actor, slotLevel) : actor;
  let s = state;
  if (spell.concentration) {
    if (caster.concentration)
      s = addLog(s, `${caster.name} deixa de se concentrar em ${caster.concentration}.`, [
        caster.id,
      ]);
    caster = { ...caster, concentration: spell.name };
  }
  s = withCreature(s, caster);
  s = setTurn(s, {
    ...turn,
    action: usesAction ? false : turn.action,
    bonus: usesAction ? turn.bonus : false,
  });
  const upcast = slotLevel > spell.level ? ` (${LEVEL(slotLevel)})` : '';
  s = addLog(s, `${caster.name} conjura ${spell.name}${upcast}.`, [caster.id]);

  const level = caster.kind === 'monster' ? Math.max(1, Math.ceil(caster.cr ?? 1)) : caster.level;
  const ability = caster.spellcasting!.ability;

  if (spell.resolution.kind === 'attack') {
    return spellAttack(s, caster, targets[0], spell, slotLevel, level, dist, ctx.rng, ability);
  }
  if (spell.resolution.kind === 'save') {
    return spellSave(
      s,
      caster,
      targets,
      spell,
      slotLevel,
      level,
      ctx.rng,
      ability,
      spell.resolution,
    );
  }
  return spellAuto(s, caster, targets, spell, slotLevel, level, ctx.rng, ability);
}

function spellAttack(
  state: EncounterState,
  caster: Creature,
  target: Creature,
  spell: Spell,
  slot: number,
  level: number,
  dist: number,
  rng: Rng,
  ability: Ability,
): EncounterState {
  const bonus = proficiencyBonus(caster) + abilityMod(caster.abilities[ability]);
  const modes: AdvMode[] = [];
  if (state.combat.dodging.includes(target.id)) modes.push('disadvantage');
  const from = tokenOf(state, caster.id)!;
  if (spell.range > 5 && adjacentFoe(state, caster, from.pos)) modes.push('disadvantage');
  const cond = attackModifiers(caster, target, dist, spell.range > 5);
  const helped = consumeHelp(state, target.id);
  state = helped.state;
  const mode = combineModes([...modes, ...helped.modes, ...cond.modes]);
  const cover = coverBonus(state, from.pos, tokenOf(state, target.id)!.pos);
  const ac = target.ac + cover;

  const d20 = rollD20(bonus, mode, rng);
  const hit = d20.crit || (!d20.fumble && d20.roll.total >= ac);
  const crit = hit && (d20.crit || cond.autoCrit);
  const head = `${spell.name}: d20 ${d20.natural} ${fmt(bonus)} = ${d20.roll.total} vs CA ${ac}${cover ? ` (cobertura +${cover})` : ''}${mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)'}`;
  if (!hit) return addLog(state, `${head} — erro.`, [caster.id, target.id]);

  let s = state;
  let text = `${head} — ${crit ? 'ACERTO CRÍTICO' : 'acerto'}`;
  let t = target;
  if (spell.damage) {
    const expr = parseDice(damageExpression(spell, slot, level));
    const r = applyDamage(t, Math.max(0, roll(crit ? criticalExpr(expr) : expr, rng).total), {
      type: spell.damage.type,
      crit,
    });
    t = r.creature;
    text += `: ${r.dealt} de dano ${dtype(spell.damage.type)}${notes(r)}`;
    s = withCreature(s, t);
    s = addLog(s, `${text}.`, [caster.id, target.id]);
    s = aftermath(s, target.id, r.dealt, rng);
  } else {
    s = addLog(s, `${text}.`, [caster.id, target.id]);
  }
  return checkOutcome(applyCondition(s, target.id, spell));
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

function applyCondition(state: EncounterState, targetId: string, spell: Spell): EncounterState {
  if (!spell.condition) return state;
  const t = creatureOf(state, targetId);
  const s = withCreature(state, addCondition(t, spell.condition.name, spell.condition.rounds));
  return addLog(s, `${t.name} ficou sob efeito de ${spell.name}.`, [t.id]);
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
  res: Extract<Spell['resolution'], { kind: 'save' }>,
): EncounterState {
  if (targets.length === 0) return addLog(state, `${spell.name} não atinge ninguém.`, [caster.id]);
  const dc = spellSaveDc(caster, ability);
  // o dano é rolado uma vez para todos
  const total = spell.damage
    ? Math.max(0, roll(damageExpression(spell, slot, level), rng).total)
    : 0;
  let s = state;
  for (const original of targets) {
    const t = creatureOf(s, original.id);
    const auto = autoFailsSave(t, res.ability);
    const r = rollD20(saveBonus(t, res.ability), 'normal', rng);
    const saved = !auto && r.roll.total >= dc;
    const head = `${t.name}: salvaguarda de ${res.ability.toUpperCase()} ${auto ? 'falha automática' : `d20 ${r.natural} = ${r.roll.total}`} vs CD ${dc} — ${saved ? 'passou' : 'falhou'}`;

    if (spell.damage) {
      const amount = saved ? (res.onSave === 'half' ? Math.floor(total / 2) : 0) : total;
      const d = applyDamage(t, amount, { type: spell.damage.type });
      s = withCreature(s, d.creature);
      s = addLog(s, `${head}: ${d.dealt} de dano ${dtype(spell.damage.type)}${notes(d)}.`, [
        caster.id,
        t.id,
      ]);
      s = aftermath(s, t.id, d.dealt, rng);
    } else {
      s = addLog(s, `${head}.`, [caster.id, t.id]);
    }
    if (!saved) s = applyCondition(s, t.id, spell);
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
): EncounterState {
  let s = state;
  for (const original of targets) {
    const t = creatureOf(s, original.id);
    if (spell.heal) {
      const amount = Math.max(
        0,
        roll(healExpression(spell, slot), rng).total +
          (spell.heal.addModifier ? abilityMod(caster.abilities[ability]) : 0),
      );
      s = withCreature(s, heal(t, amount));
      s = addLog(s, `${t.name} recupera ${amount} PV.`, [caster.id, t.id]);
    } else if (spell.damage) {
      const d = applyDamage(t, Math.max(0, roll(damageExpression(spell, slot, level), rng).total), {
        type: spell.damage.type,
      });
      s = withCreature(s, d.creature);
      s = addLog(s, `${t.name} sofre ${d.dealt} de dano ${dtype(spell.damage.type)}${notes(d)}.`, [
        caster.id,
        t.id,
      ]);
      s = aftermath(s, t.id, d.dealt, rng);
    }
  }
  return checkOutcome(s);
}
