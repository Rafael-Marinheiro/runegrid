import { Ability, Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos, SIZE_CELLS } from '../../models/grid';
import { Spell } from '../../models/spell';
import { abilitiesOf } from '../monsters/registry';
import { useLegendaryResistance } from './traits';
import { abilityReady, legendaryGate, payAbility } from './ability';
import {
  abilityMod,
  addEffect,
  applyDamage,
  attackModifiers,
  allMods,
  autoFailsSave,
  effectiveAc,
  effectsOf,
  heal,
  proficiencyBonus,
  removeEffects,
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
import { T, manualT, spellName, spellT } from '../i18n';
import { distT } from '../units';
import { isRaging } from './rage';
import { summonCreatures } from './summon';
import { moveByAbility } from './jump';
import { skillCheckAbility } from './check';
import { corrodeTarget } from './corrosion';
import { isShapechanger, planeError, samePlane, shapeShift, togglePlane } from './forms';

const LEVEL = (n: number) => (n === 0 ? T('truque', 'cantrip') : T(`${n}º nível`, `level ${n}`));

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
  if (!from)
    throw new RuleError(T(`${caster.name} não está no mapa.`, `${caster.name} is not on the map.`));
  const t = spell.target;

  if (t.kind === 'self') return { creatures: [caster], dist: 0 };

  if (t.kind === 'creature') {
    const ids = [...new Set(cmd.targetIds ?? (cmd.targetId ? [cmd.targetId] : []))];
    if (!ids.length) throw new RuleError(T('Escolha um alvo.', 'Choose a target.'));
    const max = (t.max ?? 1) + (t.perLevel ?? 0) * Math.max(0, slot - spell.level);
    if (ids.length > max)
      throw new RuleError(
        T(
          `${spell.name} atinge no máximo ${max} alvo(s) com este espaço.`,
          `${spellName(spell)} hits at most ${max} target(s) with this slot.`,
        ),
      );
    const creatures = ids.map((id) => {
      const target = creatureOf(state, id);
      const at = tokenOf(state, target.id);
      if (!at)
        throw new RuleError(
          T(`${target.name} não está no mapa.`, `${target.name} is not on the map.`),
        );
      if (role.kind === 'player' && at.hidden)
        throw new RuleError(T('Alvo não visível.', 'Target not visible.'));
      if (target.id !== caster.id && !samePlane(caster, target)) throw planeError();
      if (target.status === 'dead' && !spell.heal && !spell.revive)
        throw new RuleError(T(`${target.name} já está morto.`, `${target.name} is already dead.`));
      const d = distanceFt(from.pos, sizeOf(caster), at.pos, sizeOf(target), state.rule);
      if (d > spell.range)
        throw new RuleError(
          T(
            `Alvo fora de alcance (${distT(d)}; alcance ${distT(spell.range)}).`,
            `Target out of range (${distT(d)}; range ${distT(spell.range)}).`,
          ),
        );
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
  if (!cmd.point && !auraOnly)
    throw new RuleError(T('Escolha um ponto no mapa.', 'Choose a point on the map.'));
  const point = cmd.point ?? from.pos;
  const inMap =
    point.x >= 0 && point.y >= 0 && point.x < state.map.width && point.y < state.map.height;
  if (!inMap) throw new RuleError(T('Ponto fora do mapa.', 'Point is off the map.'));

  if (t.kind === 'point') {
    const d = distanceFt(from.pos, sizeOf(caster), point, 1, state.rule);
    if (d > spell.range)
      throw new RuleError(
        T(
          `Ponto fora de alcance (${distT(d)}; alcance ${distT(spell.range)}).`,
          `Point out of range (${distT(d)}; range ${distT(spell.range)}).`,
        ),
      );
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
      throw new RuleError(
        T(
          `Ponto fora de alcance (${distT(dist)}; alcance ${distT(spell.range)}).`,
          `Point out of range (${distT(dist)}; range ${distT(spell.range)}).`,
        ),
      );
  }
  return { creatures, dist: 0 };
}

/** Conjura uma magia: valida, gasta ação e espaço, e resolve o efeito. */
export function cast(state: EncounterState, cmd: CastCmd, ctx: Context): EncounterState {
  const spell = getSpell(cmd.spellId, cmd.ruleset);
  const known = (id: string) => {
    const who = creatureOf(state, cmd.actorId);
    return (
      who.spellcasting?.spells.includes(id) ||
      who.sustained?.some((x) => x.spellId === id) ||
      abilitiesOf(who).some((a) => a.id === id)
    );
  };
  if (!spell || !known(spell.id)) {
    throw new RuleError(
      T(
        `${creatureOf(state, cmd.actorId).name} não conhece essa magia.`,
        `${creatureOf(state, cmd.actorId).name} does not know that spell.`,
      ),
    );
  }
  if (isRaging(creatureOf(state, cmd.actorId)))
    throw new RuleError(
      T('Não se conjura durante a fúria.', 'Spells cannot be cast while raging.'),
    );
  const sustain = cmd.sustain === true;
  if (sustain && !spell.sustain)
    throw new RuleError(
      T(
        `${spell.name} não se repete a cada turno.`,
        `${spellName(spell)} does not repeat each turn.`,
      ),
    );
  if (!sustain && spell.castTime === 'reaction')
    throw new RuleError(
      T(
        'Magia de reação: use-a como reação quando o gatilho acontecer.',
        'Reaction spell: use it as a reaction when its trigger happens.',
      ),
    );

  if (actor0Form(state, cmd.actorId)?.noSpells && !spell.ability)
    throw new RuleError(
      T(
        'Na forma atual não dá para conjurar magias.',
        'You cannot cast spells in your current form.',
      ),
    );
  const long = !sustain && spell.castTime === 'long';
  if (long && state.combat.phase === 'running')
    throw new RuleError(
      T(
        `${spell.name} leva mais de uma ação para conjurar: fora do combate.`,
        `${spellName(spell)} takes more than one action to cast: outside combat.`,
      ),
    );
  if (spell.ability?.legendaryCast)
    throw new RuleError(
      T(
        'Conjure a magia da lista no turno de outra criatura: o motor cobra as ações lendárias.',
        "Cast the spell from the list on another creature's turn: the engine charges the legendary actions.",
      ),
    );
  // Conjurar uma Magia (ação lendária): magia comum lançada fora do próprio turno
  const viaLegendary =
    !spell.ability &&
    !sustain &&
    state.combat.phase === 'running' &&
    state.combat.turn?.actorId !== cmd.actorId
      ? abilitiesOf(creatureOf(state, cmd.actorId)).find(
          (a) =>
            a.ability?.legendaryCast === 'spell' ||
            (a.ability?.legendaryCast === 'cantrip' && spell.level === 0),
        )
      : undefined;
  const legendary = spell.ability?.cost === 'legendary' || !!viaLegendary;
  const { actor, turn } =
    long || legendary
      ? { actor: creatureOf(state, cmd.actorId), turn: null }
      : actorTurn(state, cmd.actorId);
  if (legendary) legendaryGate(state, actor, viaLegendary ?? spell);
  abilityReady(actor, spell);

  const kept = actor.sustained?.find((x) => x.spellId === spell.id);
  if (sustain && !kept)
    throw new RuleError(
      T(
        `${actor.name} não está mantendo ${spell.name}.`,
        `${actor.name} is not sustaining ${spellName(spell)}.`,
      ),
    );
  const slotLevel = sustain
    ? kept!.slotLevel
    : spell.level === 0
      ? 0
      : (cmd.slotLevel ?? spell.level);
  if (slotLevel < spell.level || slotLevel > 9)
    throw new RuleError(T('Espaço de magia inválido.', 'Invalid spell slot.'));

  const reverting = withOption(spell, cmd.option).form?.revert && actor.form?.noActions;
  const cost = sustain
    ? spell.sustain!.cost
    : spell.ability?.cost === 'free' || reverting
      ? 'free'
      : spell.castTime === 'bonus'
        ? 'bonus'
        : 'action';
  if (turn) {
    if (cost === 'action' && !turn.action)
      throw new RuleError(T('Sem ação disponível neste turno.', 'No action left this turn.'));
    if (cost === 'bonus' && !turn.bonus)
      throw new RuleError(
        T('Sem ação bônus disponível neste turno.', 'No bonus action left this turn.'),
      );
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
  if (spell.ability?.needsGrappled)
    for (const t of targets)
      if (!t.conditions.some((c) => c.name === 'grappled' && c.by === actor.id))
        throw new RuleError(
          T(
            `${t.name} não está agarrado por ${actor.name}.`,
            `${t.name} is not grappled by ${actor.name}.`,
          ),
        );

  // gasta espaço de magia e troca a concentração
  let caster = slotLevel > 0 && !sustain && !spell.ability ? spendSlot(actor, slotLevel) : actor;
  let s = state;
  if (!sustain && spell.concentration) {
    if (caster.concentration)
      s = addLog(
        s,
        T(
          `${caster.name} deixa de se concentrar em ${caster.concentration}.`,
          `${caster.name} stops concentrating on ${spellT(caster.concentration)}.`,
        ),
        [caster.id],
      );
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
  if (!sustain) s = payAbility(s, caster.id, viaLegendary ?? spell);
  if (turn) {
    s = setTurn(s, {
      ...turn,
      action: cost === 'action' ? false : turn.action,
      bonus: cost === 'bonus' ? false : turn.bonus,
    });
  }
  const upcast =
    slotLevel > spell.level ? T(` (${LEVEL(slotLevel)})`, ` (${LEVEL(slotLevel)})`) : '';
  const before = s;
  s = addLog(
    s,
    sustain
      ? T(
          `${caster.name} usa ${spell.name} de novo.`,
          `${caster.name} uses ${spellName(spell)} again.`,
        )
      : T(
          `${caster.name} conjura ${spell.name}${upcast}.`,
          `${caster.name} casts ${spellName(spell)}${upcast}.`,
        ),
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
  if (spell.manual)
    s = addLog(s, T(`${spell.name}: ${spell.manual}`, `${spellName(spell)}: ${manualT(spell)}`), [
      caster.id,
    ]);
  if (moveOnly) return moveZone(s, caster, spell, cmd.point!, slotLevel, ctx, cmd.ruleset);
  // alguém pode reagir à conjuração (Contrafeitiço): a resolução espera a decisão
  if (!sustain && !spell.ability) {
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
  if (use.form && !use.form.onTarget && !sustain)
    done = shapeShift(done, caster.id, use.form, cmd.ruleset ?? '2014');
  if (use.plane && !sustain) done = togglePlane(done, caster.id);
  if (use.summon && !sustain)
    done = summonCreatures(done, caster, use, slotLevel, cmd.point, cmd.ruleset ?? '2014', ctx);
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

const actor0Form = (state: EncounterState, id: string) =>
  state.creatures.find((c) => c.id === id)?.form;

const narrativeNote = (spell: Spell): string =>
  T(
    `${spell.name}: efeito narrativo, o Mestre conduz.`,
    `${spellName(spell)}: narrative effect, the GM runs it.`,
  );

/** Destruir Metal: um objeto metálico do cenário, solto, ao alcance, é destruído. */
function destroyObject(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  point?: Pos,
): EncounterState {
  const from = tokenOf(state, caster.id);
  if (!point || !from)
    throw new RuleError(T('Escolha o objeto no mapa.', 'Choose the object on the map.'));
  const obj = (state.map.objects ?? []).find(
    (o) => o.pos.x === point.x && o.pos.y === point.y && o.texture === 'metal',
  );
  if (!obj)
    throw new RuleError(
      T('Não há objeto de metal nesse ponto.', 'There is no metal object at that point.'),
    );
  const dist = distanceFt(from.pos, sizeOf(caster), obj.pos, 1, state.rule);
  if (dist > spell.range)
    throw new RuleError(
      T(
        `Objeto fora de alcance (${distT(dist)}; alcance ${distT(spell.range)}).`,
        `Object out of range (${distT(dist)}; range ${distT(spell.range)}).`,
      ),
    );
  return addLog(
    {
      ...state,
      map: { ...state.map, objects: (state.map.objects ?? []).filter((o) => o.id !== obj.id) },
    },
    T(
      `${caster.name} corrói e destrói o objeto de metal (${obj.kind}).`,
      `${caster.name} corrodes and destroys the metal object (${obj.kind}).`,
    ),
    [caster.id],
  );
}

/** Solta quem `caster` agarrava (Mergulho do Roc). */
function dropGrappled(state: EncounterState, caster: Creature): EncounterState {
  let s = state;
  for (const c of state.creatures) {
    if (!c.conditions.some((k) => k.name === 'grappled' && k.by === caster.id)) continue;
    s = withCreature(s, {
      ...creatureOf(s, c.id),
      conditions: creatureOf(s, c.id).conditions.filter(
        (k) => !(k.name === 'grappled' && k.by === caster.id),
      ),
    });
    s = addLog(s, T(`${caster.name} solta ${c.name}.`, `${caster.name} drops ${c.name}.`), [
      caster.id,
      c.id,
    ]);
  }
  return s;
}

/** Depois do movimento: quem está perto do destino sofre a parte de área (Salto Mortal, Movimento Abalador). */
function landOn(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  slot: number,
  level: number,
  ability: Ability,
  dc: number,
  ctx: Context,
): EncounterState {
  const land = spell.landing!;
  const at = tokenOf(state, caster.id);
  if (!at) return state;
  let s = state;
  const near = state.creatures.filter((c) => {
    const t = tokenOf(state, c.id);
    return (
      c.id !== caster.id &&
      c.status !== 'dead' &&
      !!t &&
      distanceFt(at.pos, sizeOf(caster), t.pos, sizeOf(c), state.rule) <= land.radius
    );
  });
  if (land.breakConcentration)
    for (const c of near)
      if (c.concentration) {
        s = withCreature(s, { ...creatureOf(s, c.id), concentration: undefined });
        s = addLog(s, T(`${c.name} perde a concentração.`, `${c.name} loses concentration.`), [
          caster.id,
          c.id,
        ]);
      }
  const maxCells = land.maxSize ? SIZE_CELLS[land.maxSize] : Infinity;
  const hit = near.filter((c) => sizeOf(c) <= maxCells);
  const sub: Spell = { ...spell, move: undefined, landing: undefined, ...land.patch };
  if (!hit.length)
    return addLog(
      s,
      T(`${spell.name}: ninguém é atingido.`, `${spellName(spell)}: no one is hit.`),
      [caster.id],
    );
  return sub.resolution.kind === 'save'
    ? spellSave(s, caster, hit, sub, slot, level, ctx.rng, ability, dc)
    : spellAuto(s, caster, hit, sub, slot, level, ctx.rng, ability, dc);
}

/** Aceleração, Agilidade Imortal, Furtividade Sombria: Correr, Desengajar e Esconder sem gastar outra ação. */
function grantActions(state: EncounterState, caster: Creature, spell: Spell): EncounterState {
  let s = state;
  const done: string[] = [];
  for (const g of spell.grants ?? []) {
    if (g === 'hide') {
      s = {
        ...s,
        tokens: s.tokens.map((t) => (t.creatureId === caster.id ? { ...t, hidden: true } : t)),
      };
      done.push(T('Esconder', 'Hide'));
    } else if (s.combat.turn?.actorId === caster.id) {
      s = {
        ...s,
        combat: {
          ...s.combat,
          turn: { ...s.combat.turn, ...(g === 'dash' ? { dashed: true } : { disengaged: true }) },
        },
      };
      done.push(g === 'dash' ? T('Correr', 'Dash') : T('Desengajar', 'Disengage'));
    }
  }
  return addLog(
    s,
    T(
      `${caster.name} usa ${done.join(' e ') || spell.name}.`,
      `${caster.name} uses ${done.join(' and ') || spellName(spell)}.`,
    ),
    [caster.id],
  );
}

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
  const dc =
    spell.ability?.dc ??
    source.summon?.dc ??
    (source.spellcasting ? spellSaveDc(source, ability) : 8);
  const t = spell.target;
  const pointOrigin = (t.kind === 'sphere' || t.kind === 'cube') && !t.self;
  const origin = pointOrigin ? cmd.point : tokenOf(s, caster.id)?.pos;

  if (spell.toggle && effectsOf(caster).some((e) => e.spell === spell.id)) {
    s = withCreature(
      s,
      removeEffects(creatureOf(s, caster.id), (e) => e.spell === spell.id),
    );
    return addLog(
      s,
      T(`${caster.name}: ${spell.name} termina.`, `${caster.name}: ${spellName(spell)} ends.`),
      [caster.id],
    );
  }
  if (spell.destroyObject) return destroyObject(s, caster, spell, cmd.point);
  if (spell.grants) return grantActions(s, caster, spell);
  if (spell.check) return skillCheckAbility(s, caster, spell, ctx.rng);
  if (spell.narrative) return s;
  if (mode !== 'cast' || !spell.noInitial) {
    if (spell.teleport) s = teleport(s, caster, cmd.point, spell.teleportNear);
    else if (spell.move) {
      s = moveByAbility(s, caster, spell.move, cmd.point, ctx);
      if (spell.dropGrappled) s = dropGrappled(s, caster);
      if (spell.landing)
        s = landOn(s, creatureOf(s, caster.id), spell, slot, level, ability, dc, ctx);
    } else if (
      spell.damage ||
      spell.heal ||
      spell.condition ||
      spell.effect ||
      spell.tempHp ||
      spell.stabilize ||
      spell.cure ||
      spell.dispel ||
      spell.revive ||
      spell.kill ||
      spell.table ||
      spell.push ||
      spell.corrode ||
      spell.form?.onTarget
    ) {
      // Palavra de Poder: só quem tem PV de menos é afetado
      let list = targets;
      if (spell.ifHpAtMost !== undefined) {
        list = targets.filter((t) => t.hp.current <= spell.ifHpAtMost!);
        for (const t of targets.filter((x) => !list.includes(x)))
          s = addLog(
            s,
            T(
              `${t.name} tem PV demais (${t.hp.current} > ${spell.ifHpAtMost}): sem efeito.`,
              `${t.name} has too many HP (${t.hp.current} > ${spell.ifHpAtMost}): no effect.`,
            ),
            [caster.id, t.id],
          );
      }
      const run = (who: Creature[], sp: Spell): EncounterState => {
        if (sp.resolution.kind === 'pool')
          return spellPool(s, caster, who, sp, slot, ctx.rng, ability, dc, origin);
        if (sp.resolution.kind === 'attack') {
          let out = spellAttacks(
            s,
            caster,
            who,
            sp,
            slot,
            level,
            ctx.rng,
            ability,
            dc,
            origin,
            cmd.ruleset,
          );
          if (sp.splash && who[0])
            out = splashArea(out, caster, who[0].id, sp, slot, level, ctx.rng, ability, dc);
          return out;
        }
        if (sp.resolution.kind === 'save')
          return spellSave(s, caster, who, sp, slot, level, ctx.rng, ability, dc, origin);
        return spellAuto(s, caster, who, sp, slot, level, ctx.rng, ability, dc, origin);
      };
      if (spell.table) {
        const tb = spell.table;
        for (const t of list) {
          const cur = creatureOf(s, t.id);
          const v = tb.by === 'hp' ? cur.hp.current : roll(`1d${tb.die ?? 8}`, ctx.rng).total;
          const row = tb.rows.find((r) => v >= r.from && v <= r.to);
          if (!row) {
            s = addLog(
              s,
              T(
                `${spell.name}: ${cur.name} não sofre efeito (${tb.by === 'hp' ? 'PV' : 'd' + tb.die} ${v}).`,
                `${spellName(spell)}: ${cur.name} is unaffected (${tb.by === 'hp' ? 'HP' : 'd' + tb.die} ${v}).`,
              ),
              [caster.id, cur.id],
            );
            continue;
          }
          s = addLog(
            s,
            T(
              `${spell.name}: ${cur.name} (${tb.by === 'hp' ? 'PV' : 'd' + tb.die} ${v}).`,
              `${spellName(spell)}: ${cur.name} (${tb.by === 'hp' ? 'HP' : 'd' + tb.die} ${v}).`,
            ),
            [caster.id, cur.id],
          );
          s = run([cur], { ...spell, table: undefined, ...row.patch });
        }
      } else if (list.length || targets.length === 0) s = run(list, spell);
    } else if (
      !spell.push &&
      !spell.zone &&
      targets.length === 0 &&
      spell.target.kind !== 'point'
    ) {
      s = addLog(s, T(`${spell.name} não atinge ninguém.`, `${spellName(spell)} hits no one.`), [
        caster.id,
      ]);
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

function teleport(
  state: EncounterState,
  caster: Creature,
  point?: Pos,
  near?: number,
): EncounterState {
  const tok = tokenOf(state, caster.id);
  if (!tok || !point) throw new RuleError(T('Escolha o destino.', 'Choose the destination.'));
  const blocked = occupiedCells(state, (c) => c.id !== caster.id);
  if (!canStand(state.map, point, sizeOf(caster), blocked))
    throw new RuleError(T('Destino ocupado ou bloqueado.', 'Destination is occupied or blocked.'));
  if (near !== undefined) {
    const close = state.tokens.some((t) => {
      const o = creatureOf(state, t.creatureId);
      return (
        teamOf(o) !== teamOf(caster) &&
        o.status !== 'dead' &&
        distanceFt(point, sizeOf(caster), t.pos, sizeOf(o), state.rule) <= near
      );
    });
    if (!close)
      throw new RuleError(
        T(
          `O destino tem de ficar a até ${distT(near)} de um inimigo.`,
          `The destination must be within ${distT(near)} of a foe.`,
        ),
      );
  }
  const moved = {
    ...state,
    tokens: state.tokens.map((t) => (t.creatureId === caster.id ? { ...t, pos: point } : t)),
  };
  return addLog(
    moved,
    T(
      `${caster.name} reaparece em outro ponto do mapa.`,
      `${caster.name} reappears elsewhere on the map.`,
    ),
    [caster.id],
  );
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
  const bonus =
    spell.ability?.attackBonus ?? proficiencyBonus(caster) + abilityMod(caster.abilities[ability]);
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
  const label = ray
    ? T(`${spell.name} (raio ${ray})`, `${spellName(spell)} (ray ${ray})`)
    : spellName(spell);
  const head = T(
    `${label}: d20 ${d20.natural} ${fmt(bonus)}${extra.text} = ${total} vs CA ${ac}${cover ? ` (cobertura +${cover})` : ''}${mode === 'normal' ? '' : mode === 'advantage' ? ' (vantagem)' : ' (desvantagem)'}`,
    `${label}: d20 ${d20.natural} ${fmt(bonus)}${extra.text} = ${total} vs AC ${ac}${cover ? ` (cover +${cover})` : ''}${mode === 'normal' ? '' : mode === 'advantage' ? ' (advantage)' : ' (disadvantage)'}`,
  );
  const mod = abilityMod(caster.abilities[ability]);
  const dec = decoy(state, target.id, total, rng, hit);
  if (dec) return dropOnAttack(dec, caster.id);
  if (!hit) {
    const miss = addLog(state, T(`${head} — erro.`, `${head} — miss.`), [caster.id, target.id]);
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

export function spellSave(
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
  if (targets.length === 0)
    return addLog(
      state,
      T(`${spell.name} não atinge ninguém.`, `${spellName(spell)} hits no one.`),
      [caster.id],
    );
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
    const immuneId = `${caster.id}:${spell.id}:immune`;
    if (spell.immuneOnSave && effectsOf(t).some((e) => e.id === immuneId)) {
      s = addLog(
        s,
        T(`${t.name} é imune a ${spell.name}.`, `${t.name} is immune to ${spellName(spell)}.`),
        [caster.id, t.id],
      );
      continue;
    }
    const auto = autoFailsSave(t, res.ability);
    const sv = saveExtra(s, t.id, res.ability, rng);
    s = sv.state;
    // Resistência à Magia: vantagem contra magias (não contra as habilidades de outros monstros)
    const smode =
      !spell.ability && allMods(t).some((m) => m.magicResistance)
        ? combineModes([sv.mode, 'advantage'])
        : sv.mode;
    const r = rollD20(saveBonus(t, res.ability), smode, rng);
    const total = r.roll.total + sv.bonus;
    const shifter = !!spell.form?.onTarget && isShapechanger(t);
    let saved = shifter || (!auto && total >= dc);
    const modeTxt = T(
      smode === 'normal' ? '' : smode === 'advantage' ? ' (vantagem)' : ' (desvantagem)',
      smode === 'normal' ? '' : smode === 'advantage' ? ' (advantage)' : ' (disadvantage)',
    );
    // Resistência Lendária: a salvaguarda falha, mas o monstro escolhe passar
    const resisted = saved ? null : useLegendaryResistance(s, t.id);
    if (resisted?.used) {
      s = resisted.state;
      saved = true;
    }
    const lr = resisted?.used
      ? T(
          ` (Resistência Lendária, restam ${resisted.left}/${resisted.max})`,
          ` (Legendary Resistance, ${resisted.left}/${resisted.max} left)`,
        )
      : '';
    const head = T(
      `${t.name}: salvaguarda de ${res.ability.toUpperCase()} ${auto ? 'falha automática' : `d20 ${r.natural}${sv.text} = ${total}`}${modeTxt} vs CD ${dc} — ${saved ? 'passou' : 'falhou'}${lr}`,
      `${t.name}: ${res.ability.toUpperCase()} saving throw ${auto ? 'automatic failure' : `d20 ${r.natural}${sv.text} = ${total}`}${modeTxt} vs DC ${dc} — ${saved ? 'passed' : 'failed'}${lr}`,
    );

    if (rolled.length) {
      let cur = creatureOf(s, t.id);
      const lines: string[] = [];
      let dealtTotal = 0;
      for (const { p, total: dmg } of rolled) {
        const amount = saved ? (res.onSave === 'half' ? Math.floor(dmg / 2) : 0) : dmg;
        const d = applyDamage(cur, amount, { type: p.type });
        cur = d.creature;
        dealtTotal += d.dealt;
        lines.push(
          T(
            `${d.dealt} de dano ${dtype(p.type)}${notes(d)}`,
            `${d.dealt} ${dtype(p.type)} damage${notes(d)}`,
          ),
        );
      }
      s = withCreature(s, cur);
      s = addLog(s, `${head}: ${lines.join(' + ')}.`, [caster.id, t.id]);
      s = aftermath(s, t.id, dealtTotal, rng);
    } else {
      s = addLog(s, `${head}.`, [caster.id, t.id]);
    }
    if (saved && spell.immuneOnSave)
      s = withCreature(
        s,
        addEffect(creatureOf(s, t.id), {
          id: immuneId,
          spell: `${spell.id}:immune`,
          name: spell.name,
          by: caster.id,
          rounds: spell.immuneOnSave,
          mods: {
            note: `Imune a ${spell.name} de ${caster.name}.`,
            noteEn: `Immune to ${spellName(spell)} from ${caster.name}.`,
          },
        }),
      );
    if (!saved && spell.corrode)
      s = corrodeTarget(s, caster.id, t.id, spell.corrode.kind, spell.corrode.on);
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
  let pool = spell.heal?.pool ? Math.max(0, flatHeal(spell, slot)) : 0;
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
      const back = spell.revive === 'full' ? t.hp.max : 1;
      s = withCreature(s, {
        ...t,
        status: 'alive',
        hp: { ...t.hp, current: back },
        deathSaves: { successes: 0, failures: 0 },
      });
      s = addLog(
        s,
        T(`${t.name} volta à vida com ${back} PV.`, `${t.name} returns to life with ${back} HP.`),
        [caster.id, t.id],
      );
      s = applyRiders(s, caster, t.id, spell, slot, dc, ability, rng, point);
      continue;
    }
    if (spell.heal) {
      const total = Math.max(
        0,
        (spell.heal.dice ? roll(healExpression(spell, slot), rng).total : 0) +
          flatHeal(spell, slot) +
          (spell.heal.addModifier ? mod : 0),
      );
      // reserva dividida (Cura Completa em Massa): cada alvo recebe só o que lhe falta, até acabar
      const amount = spell.heal.pool ? Math.min(total, pool, t.hp.max - t.hp.current) : total;
      if (spell.heal.pool) pool -= amount;
      const healed = heal(t, amount);
      s = withCreature(s, healed);
      s = addLog(
        s,
        T(
          `${t.name} recupera ${healed.hp.current - t.hp.current} PV.`,
          `${t.name} regains ${healed.hp.current - t.hp.current} HP.`,
        ),
        [caster.id, t.id],
      );
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
        lines.push(
          T(
            `${d.dealt} de dano ${dtype(it.type)}${notes(d)}`,
            `${d.dealt} ${dtype(it.type)} damage${notes(d)}`,
          ),
        );
      }
      s = withCreature(s, cur);
      s = addLog(
        s,
        T(`${t.name} sofre ${lines.join(' + ')}.`, `${t.name} takes ${lines.join(' + ')}.`),
        [caster.id, t.id],
      );
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
  let s = addLog(
    state,
    T(`${spell.name}: reserva de ${pool} PV.`, `${spellName(spell)}: pool of ${pool} HP.`),
    [caster.id],
  );
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
  let s = addLog({ ...state, zones }, T(`${spell.name} se move.`, `${spellName(spell)} moves.`), [
    caster.id,
  ]);
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
    lines.push(
      T(
        `${r.dealt} de dano ${dtype(p.type)}${notes(r)}`,
        `${r.dealt} ${dtype(p.type)} damage${notes(r)}`,
      ),
    );
  }
  let s = withCreature(state, cur);
  s = addLog(
    s,
    T(
      `${spell.name} respinga no alvo: ${lines.join(' + ')}.`,
      `${spellName(spell)} splashes the target: ${lines.join(' + ')}.`,
    ),
    [caster.id, targetId],
  );
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
