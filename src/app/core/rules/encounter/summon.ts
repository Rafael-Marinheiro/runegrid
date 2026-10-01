import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos, SIZE_CELLS } from '../../models/grid';
import { Spell, SummonSpec } from '../../models/spell';
import { abilityMod, allMods, canAct, proficiencyBonus, RuleError, spellSaveDc } from '../creature';
import {
  draconicSpirit,
  DragonType,
  faithfulHound,
  animatedChain,
  otherworldlySteed,
  SteedKind,
} from '../monsters/custom';
import { canStand, distanceFt, footprint, key } from '../grid/movement';
import { roll } from '../dice';
import { T, spellName } from '../i18n';
import { abilitiesOf } from '../monsters/registry';
import { stateKey } from './ability';
import { removeCreature } from './reduce';
import { Context } from './helpers';
import { addLog, creatureOf, occupiedCells, sizeOf, teamOf, tokenOf, withCreature } from './state';
import { attachFx, attackFx, centerOf } from './fx';
import { resolveSpell } from './cast';
import { Fx } from '../../models/fx';

/** Quem fornece a ficha de uma criatura do SRD (a tela e o MCP registram o seu). */
export type SummonSource = (srdId: string, ruleset: '2014' | '2024') => Creature | undefined;

let source: SummonSource = () => undefined;
export const registerSummonSource = (fn: SummonSource): void => {
  source = fn;
};
/** Idioma dos nomes das fichas montadas na hora (a tela registra o idioma da interface). */
let nameLang: () => 'pt' | 'en' = () => 'en';
export const registerSummonLang = (fn: () => 'pt' | 'en'): void => {
  nameLang = fn;
};

export const summonTemplate: SummonSource = (id, ruleset) => source(id, ruleset);

/** Ficha de um bloco que escala com o espaço (Corcel de Outro Mundo). */
function customTemplate(
  kind: 'otherworldly-steed' | 'draconic-spirit' | 'faithful-hound' | 'animated-chain',
  variant: string,
  ruleset: '2014' | '2024',
  slot: number,
  caster: Creature,
): Creature {
  if (kind === 'animated-chain') return animatedChain(nameLang() === 'en');
  if (kind === 'faithful-hound') return faithfulHound(caster, ruleset, nameLang() === 'en');
  return kind === 'otherworldly-steed'
    ? otherworldlySteed(caster, Math.max(2, slot), variant as SteedKind, nameLang() === 'en')
    : draconicSpirit(caster, Math.max(5, slot), variant as DragonType, nameLang() === 'en');
}

/** Mordida do Cão Fiel: ataque de magia, 4d8 perfurante (2014) ou salvaguarda de Destreza, 4d8 de energia (2024). */
function houndGuard(
  caster: Creature,
  ruleset: '2014' | '2024',
): NonNullable<Creature['summon']>['guard'] {
  const casting = caster.spellcasting?.ability ?? 'wis';
  return ruleset === '2024'
    ? { mode: 'save', dice: '4d8', type: 'force', movable: true }
    : {
        mode: 'attack',
        dice: '4d8',
        type: 'piercing',
        bonus: proficiencyBonus(caster) + abilityMod(caster.abilities[casting]),
      };
}

const casterDc = (caster: Creature): number =>
  spellSaveDc(caster, caster.spellcasting?.ability ?? 'wis');

/** Células livres mais próximas de `point` onde uma criatura do tamanho dado cabe. */
function freeSpots(
  state: EncounterState,
  point: Pos,
  size: number,
  blocked: Set<string>,
  count: number,
): Pos[] {
  const out: Pos[] = [];
  const taken = new Set(blocked);
  const r = Math.max(state.map.width, state.map.height);
  const cells: Pos[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) cells.push({ x: point.x + dx, y: point.y + dy });
  cells.sort(
    (a, b) =>
      Math.max(Math.abs(a.x - point.x), Math.abs(a.y - point.y)) -
        Math.max(Math.abs(b.x - point.x), Math.abs(b.y - point.y)) ||
      Math.abs(a.x - point.x) +
        Math.abs(a.y - point.y) -
        (Math.abs(b.x - point.x) + Math.abs(b.y - point.y)),
  );
  for (const c of cells) {
    if (out.length >= count) break;
    if (!canStand(state.map, c, size, taken)) continue;
    out.push(c);
    for (const f of footprint(c, size)) taken.add(key(f));
  }
  return out;
}

const mult = (spec: SummonSpec, slot: number): number =>
  (spec.countScale ?? []).reduce((m, s) => (slot >= s.from ? Math.max(m, s.mult) : m), 1);

/** Nome com número quando há várias iguais ("Lobo 2"). */
function nameFor(state: EncounterState, base: string, many: boolean, seen: Set<string>): string {
  if (!many && !state.creatures.some((c) => c.name === base) && !seen.has(base)) return base;
  let i = 1;
  while (state.creatures.some((c) => c.name === `${base} ${i}`) || seen.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Faz a criatura invocada sumir do mapa, com uma linha própria no registro. */
function vanish(
  state: EncounterState,
  id: string,
  ctx: Context,
  pt: string,
  en: string,
): EncounterState {
  const c = creatureOf(state, id);
  const s = addLog(state, T(`${c.name} ${pt}.`, `${c.name} ${en}.`), [c.id]);
  return removeCreature(s, id, ctx, false);
}

/** Cria as criaturas da magia no mapa, perto do ponto, logo depois de quem invocou na iniciativa. */
export function summonCreatures(
  state: EncounterState,
  caster: Creature,
  spell: Spell,
  slot: number,
  point: Pos | undefined,
  ruleset: '2014' | '2024',
  ctx: Context,
): EncounterState {
  const spec = spell.summon;
  const from = tokenOf(state, caster.id);
  if (!spec || !from) return state;
  const name = spellName(spell);
  if (spec.chance !== undefined && ctx.rng() >= spec.chance)
    return addLog(
      state,
      T(`${spell.name}: ninguém atendeu ao chamado.`, `${name}: no one answered the call.`),
      [caster.id],
    );
  let srd = spec.srd;
  if (spec.pick?.length) {
    const total = spec.pick.reduce((sum, x) => sum + (x.weight ?? 1), 0);
    let r = ctx.rng() * total;
    srd = spec.pick.find((x) => (r -= x.weight ?? 1) < 0)?.srd ?? spec.pick[0].srd;
  }
  if (!srd) throw new RuleError(T('Escolha o que invocar.', 'Choose what to summon.'));
  const template = spec.custom
    ? customTemplate(spec.custom, srd, ruleset, slot, caster)
    : summonTemplate(srd, ruleset);
  if (!template)
    throw new RuleError(
      T(
        'Os dados desta criatura ainda não carregaram; tente de novo em instantes.',
        "This creature's data has not loaded yet; try again in a moment.",
      ),
    );
  if (spec.maxCr) {
    const cap = spec.maxCr.base + Math.max(0, slot - spec.maxCr.from);
    if ((template.cr ?? 0) > cap)
      throw new RuleError(
        T(
          `${template.name} passa do ND máximo (${cap}) com este espaço.`,
          `${template.name} is above the maximum CR (${cap}) with this slot.`,
        ),
      );
  }
  let s = state;
  // invocação única: a nova substitui a anterior (Familiar, Montaria)
  if (spec.unique)
    for (const old of s.creatures.filter(
      (c) => c.summon?.by === caster.id && c.summon.unique === spec.unique,
    ))
      s = vanish(s, old.id, ctx, 'some (foi substituído)', 'vanishes (replaced)');
  const extra = spec.extraPerLevel
    ? spec.extraPerLevel.add * Math.max(0, slot - spec.extraPerLevel.from)
    : 0;
  const base = spec.dice ? roll(spec.dice, ctx.rng).total : (spec.n ?? 1);
  let total = base * mult(spec, slot) + extra;
  if (spec.cap) {
    const have = s.creatures.filter((c) => c.summon?.by === caster.id && c.srdId === srd).length;
    total = Math.min(total, spec.cap - have);
    if (total <= 0)
      throw new RuleError(
        T(
          `${caster.name} já controla o máximo (${spec.cap}) de ${template.name}.`,
          `${caster.name} already controls the maximum (${spec.cap}) of ${template.name}.`,
        ),
      );
  }
  const spots = freeSpots(s, point ?? from.pos, sizeOf(template), occupiedCells(s), total);
  if (!spots.length)
    throw new RuleError(
      T('Não há espaço livre para invocar.', 'There is no free space to summon.'),
    );
  const kind: Creature['kind'] = caster.kind === 'monster' ? 'monster' : 'npc';
  const usedNames = new Set<string>();
  const usedIds = new Set<string>();
  const made: Creature[] = spots.map((): Creature => {
    const nm = nameFor(s, template.name, total > 1, usedNames);
    usedNames.add(nm);
    let id = `${caster.id}~${srd}~1`;
    for (let k = 2; s.creatures.some((c) => c.id === id) || usedIds.has(id); k++)
      id = `${caster.id}~${srd}~${k}`;
    usedIds.add(id);
    const rounds = spec.rounds ?? spell.rounds;
    const blocked = spec.blockSelf
      ? Object.fromEntries(
          abilitiesOf(template)
            .filter((a) => a.summon || a.options?.some((o) => o.patch.summon))
            .map((a) => [stateKey(a), { used: 99 }]),
        )
      : {};
    return {
      ...template,
      id,
      name: nm,
      kind,
      ...(spec.blockSelf ? { abilityState: { ...template.abilityState, ...blocked } } : {}),
      summon: {
        by: caster.id,
        spell: spell.name,
        ...(!spec.permanent && rounds ? { rounds } : {}),
        ...(spell.concentration && !spec.permanent ? { concentration: true } : {}),
        ...(spec.onBreak ? { onBreak: spec.onBreak } : {}),
        // as invocações de monstros contam como derrotadas (dão XP): ficam como cadáver
        ...(spec.corpse || kind === 'monster' ? { corpse: true } : {}),
        ...(spec.unique ? { unique: spec.unique } : {}),
        ...(spec.custom ? { dc: casterDc(caster) } : {}),
        ...(spec.leashFt ? { leashFt: spec.leashFt } : {}),
        ...(spec.endsIfOwnerIncapacitated ? { endsIfOwnerIncapacitated: true } : {}),
        ...(spec.custom === 'faithful-hound' ? { guard: houndGuard(caster, ruleset) } : {}),
      },
    };
  });
  const before = s;
  made.forEach((c, i) => {
    s = {
      ...s,
      creatures: [...s.creatures, c],
      tokens: [
        ...s.tokens,
        { creatureId: c.id, pos: spots[i], ...(spec.hidden ? { hidden: true } : {}) },
      ],
    };
  });
  // entram na iniciativa de quem invocou, logo depois dele
  const { combat } = s;
  const at = combat.order.indexOf(caster.id);
  if (combat.phase !== 'running' && combat.initiative[caster.id] !== undefined) {
    const initiative = { ...combat.initiative };
    for (const c of made) initiative[c.id] = initiative[caster.id];
    s = { ...s, combat: { ...combat, initiative } };
  }
  if (combat.phase === 'running' && at >= 0) {
    const order = [...combat.order];
    const initiative = { ...combat.initiative };
    made.forEach((c, i) => {
      initiative[c.id] = initiative[caster.id];
      order.splice(at + 1 + i, 0, c.id);
    });
    s = { ...s, combat: { ...combat, order, initiative } };
  }
  const color = spell.vfx?.color ?? 'arcane';
  const fx: Fx[] = made.flatMap((c) => {
    const p = centerOf(s, c.id);
    return p ? [{ kind: 'burst' as const, at: p, radius: 1, color }] : [];
  });
  const names = made.map((c) => c.name).join(', ');
  const short = made.length < total;
  s = addLog(
    s,
    T(
      `${caster.name} invoca: ${names}${short ? ` (só ${made.length} de ${total} couberam)` : ''}.`,
      `${caster.name} summons: ${names}${short ? ` (only ${made.length} of ${total} fit)` : ''}.`,
    ),
    [caster.id],
  );
  return attachFx(before, s, fx);
}

/**
 * Mantém as invocações em dia: somem quando a concentração de quem as invocou quebra (ou ficam
 * hostis), quando quem invocou morre ou sai de cena, e ao chegar a 0 PV (menos as que ficam de cadáver).
 */
export function syncSummons(state: EncounterState, ctx: Context): EncounterState {
  let s = state;
  for (const c of state.creatures) {
    const sm = c.summon;
    const cur = s.creatures.find((x) => x.id === c.id);
    if (!sm || !cur) continue;
    if (cur.status === 'dead') {
      if (!sm.corpse) s = vanish(s, c.id, ctx, 'desaparece', 'disappears');
      continue;
    }
    const owner = s.creatures.find((x) => x.id === sm.by);
    const lost = !!sm.concentration && owner?.concentration !== sm.spell;
    const orphan = (!owner || owner.status === 'dead') && sm.rounds !== undefined;
    const disabled = !!sm.endsIfOwnerIncapacitated && !!owner && !canAct(owner);
    const far =
      !!sm.leashFt &&
      !!owner &&
      (() => {
        const a = tokenOf(s, cur.id);
        const b = tokenOf(s, owner.id);
        return (
          !!a && !!b && distanceFt(a.pos, sizeOf(cur), b.pos, sizeOf(owner), s.rule) > sm.leashFt!
        );
      })();
    if (far) {
      s = vanish(
        s,
        c.id,
        ctx,
        'desaparece (você se afastou demais)',
        'disappears (you moved too far away)',
      );
      continue;
    }
    if (lost && sm.onBreak === 'hostile' && owner && owner.status !== 'dead') {
      const { summon, ...rest } = cur;
      s = addLog(
        withCreature(s, {
          ...rest,
          kind: 'monster',
          summon: { by: summon!.by, spell: summon!.spell, rounds: 600 },
        }),
        T(
          `${cur.name} se liberta e fica hostil (a concentração quebrou).`,
          `${cur.name} breaks free and turns hostile (concentration broke).`,
        ),
        [cur.id],
      );
    } else if (disabled)
      s = vanish(
        s,
        c.id,
        ctx,
        'volta a ser uma corrente comum (o dono está incapacitado)',
        'reverts to an ordinary chain (its owner is incapacitated)',
      );
    else if (lost || orphan)
      s = vanish(s, c.id, ctx, 'desaparece (a magia acabou)', 'disappears (the spell ended)');
  }
  return s;
}

/** No fim do turno de quem invocou: conta as rodadas e some quando o prazo acaba. */
export function tickSummons(state: EncounterState, ownerId: string, ctx: Context): EncounterState {
  let s = state;
  for (const c of state.creatures) {
    if (c.summon?.by !== ownerId || c.summon.rounds === undefined) continue;
    const cur = s.creatures.find((x) => x.id === c.id);
    if (!cur?.summon) continue;
    const left = (cur.summon.rounds ?? 0) - 1;
    s =
      left <= 0
        ? vanish(s, c.id, ctx, 'desaparece (o prazo acabou)', 'disappears (its time ran out)')
        : withCreature(s, { ...cur, summon: { ...cur.summon, rounds: left } });
  }
  return s;
}

const SMALLER: Record<Creature['size'], Creature['size']> = {
  gargantuan: 'huge',
  huge: 'large',
  large: 'medium',
  medium: 'small',
  small: 'tiny',
  tiny: 'tiny',
};

/**
 * Dividir (gosmas): ao sofrer dano elétrico ou cortante com 10 PV ou mais, a criatura Média ou maior
 * se divide em duas, cada uma com metade dos PV e um tamanho menor; a nova age junto da original.
 */
export function splitOnDamage(state: EncounterState, id: string, dealt: number): EncounterState {
  const c = state.creatures.find((x) => x.id === id);
  if (!c || dealt <= 0 || c.status !== 'alive' || !allMods(c).some((m) => m.split)) return state;
  if (c.lastHit?.type !== 'lightning' && c.lastHit?.type !== 'slashing') return state;
  if (c.hp.current < 10 || sizeOf(c) < 1 || c.size === 'small' || c.size === 'tiny') return state;
  const at = tokenOf(state, id);
  if (!at) return state;
  const half = Math.floor(c.hp.current / 2);
  const size = SMALLER[c.size];
  const spots = freeSpots(
    state,
    at.pos,
    SIZE_CELLS[size],
    occupiedCells(state, (o) => o.id !== id),
    1,
  );
  if (!spots.length) return state;
  let n = 1;
  while (state.creatures.some((x) => x.id === `${id}~split~${n}`)) n++;
  const twin: Creature = {
    ...c,
    id: `${id}~split~${n}`,
    name: nameFor(state, c.name.replace(/ \d+$/, ''), true, new Set()),
    size,
    hp: { ...c.hp, current: half, max: Math.min(c.hp.max, half) },
  };
  const orig: Creature = {
    ...c,
    size,
    hp: { ...c.hp, current: half, max: Math.min(c.hp.max, half) },
  };
  let s = withCreature(state, orig);
  s = {
    ...s,
    creatures: [...s.creatures, twin],
    tokens: [...s.tokens, { creatureId: twin.id, pos: spots[0] }],
  };
  const { combat } = s;
  const i = combat.order.indexOf(id);
  if (i >= 0) {
    const order = [...combat.order];
    order.splice(i + 1, 0, twin.id);
    s = {
      ...s,
      combat: {
        ...combat,
        order,
        initiative: { ...combat.initiative, [twin.id]: combat.initiative[id] },
      },
    };
  }
  return addLog(
    s,
    T(
      `${c.name} se divide em duas: ${orig.name} e ${twin.name} (${half} PV cada).`,
      `${c.name} splits in two: ${orig.name} and ${twin.name} (${half} HP each).`,
    ),
    [id],
  );
}

/**
 * Guardas (Cão Fiel): no início de cada turno de quem as invocou, atacam um inimigo a até 5 ft.
 * 2014: ataque de magia (4d8 perfurante); 2024: salvaguarda de Destreza (4d8 de energia).
 */
export function guardBites(state: EncounterState, ownerId: string, ctx: Context): EncounterState {
  let s = state;
  for (const g of state.creatures) {
    const guard = g.summon?.guard;
    if (g.summon?.by !== ownerId || !guard) continue;
    const owner = s.creatures.find((x) => x.id === ownerId);
    const at = tokenOf(s, g.id);
    if (!owner || !at) continue;
    const foe = s.tokens
      .map((t) => ({ t, c: s.creatures.find((x) => x.id === t.creatureId)! }))
      .find(
        ({ t, c }) =>
          c.id !== g.id &&
          c.status !== 'dead' &&
          teamOf(c) !== teamOf(owner) &&
          !c.summon?.guard &&
          distanceFt(at.pos, sizeOf(g), t.pos, sizeOf(c), s.rule) <= 5,
      )?.c;
    if (!foe) continue;
    const bite: Spell = {
      id: 'guard-bite',
      name: 'Mordida do Cão Fiel',
      nameEn: 'Faithful Hound bite',
      level: 0,
      school: 'Conjuração',
      castTime: 'action',
      range: 5,
      concentration: false,
      description: '',
      target: { kind: 'creature' },
      resolution:
        guard.mode === 'attack'
          ? { kind: 'attack' }
          : { kind: 'save', ability: 'dex', onSave: 'none' },
      damage: { dice: guard.dice, type: guard.type },
      ability: {
        cost: 'free',
        ...(guard.bonus !== undefined ? { attackBonus: guard.bonus } : {}),
        ...(g.summon?.dc ? { dc: g.summon.dc } : {}),
      },
    };
    const before = s;
    s = addLog(s, T(`${g.name} morde ${foe.name}.`, `${g.name} bites ${foe.name}.`), [foe.id]);
    s = resolveSpell(s, g, bite, 0, [foe], 5, ctx, { ruleset: '2014' });
    s = attachFx(before, s, attackFx(before, g.id, foe.id, 5, guard.type, 'Bite'));
  }
  return s;
}
