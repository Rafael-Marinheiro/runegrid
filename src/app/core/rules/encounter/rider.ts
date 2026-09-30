import { Ability, CONDITION_LABEL, Creature } from '../../models/creature';
import { ActiveEffect } from '../../models/effect';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Spell, SpellCondition } from '../../models/spell';
import {
  abilityMod,
  addCondition,
  addEffect,
  addTempHp,
  removeCondition,
  removeEffects,
} from '../creature';
import { roll, rollD20, Rng } from '../dice';
import { canStand } from '../grid/movement';
import { allSpells, getSpell } from '../spells/data';
import { flatTemp } from '../spells/scaling';
import { aftermath } from './helpers';
import { addLog, creatureOf, occupiedCells, sizeOf, tokenOf, withCreature } from './state';

const asList = (c: Spell['condition']): SpellCondition[] => (!c ? [] : Array.isArray(c) ? c : [c]);

/** Efeito ativo que a magia cria para o espaço usado; `null` se ela não tem efeito. */
export function makeEffect(
  spell: Spell,
  caster: Creature,
  slot: number,
  dc: number,
  ability: Ability,
  targetId?: string,
): ActiveEffect | null {
  const e = spell.effect;
  if (!e) return null;
  let mods = { ...e.mods };
  for (const s of (e.scale ?? []).filter((x) => slot >= x.from).sort((a, b) => a.from - b.from))
    mods = { ...mods, ...s.mods };
  if (mods.weaponDamage?.onlyAgainst === '@target' && targetId)
    mods = { ...mods, weaponDamage: { ...mods.weaponDamage, onlyAgainst: targetId } };
  if (mods.onHit?.save) mods = { ...mods, onHit: { ...mods.onHit, dc } };
  if (mods.repeatSave) mods = { ...mods, repeatSave: { ability: mods.repeatSave.ability, dc } };
  if (mods.tempPerTurnMod)
    mods = { ...mods, tempPerTurn: Math.max(0, abilityMod(caster.abilities[ability])) };
  const rounds = e.rounds ?? spell.rounds;
  return {
    id: `${caster.id}:${spell.id}`,
    spell: spell.id,
    name: spell.name,
    by: caster.id,
    ...(rounds !== undefined ? { rounds } : {}),
    ...(e.ends ? { ends: e.ends } : {}),
    ...(spell.concentration ? { concentration: true } : {}),
    ...(e.endsOnDamage ? { endsOnDamage: true } : {}),
    mods,
  };
}

/**
 * Consequências, além do dano, em quem foi atingido (ataque), falhou (salvaguarda) ou foi alvo
 * (automática): condições, efeito ativo, PV temporários e empurrão.
 */
export function applyRiders(
  state: EncounterState,
  caster: Creature,
  targetId: string,
  spell: Spell,
  slot: number,
  dc: number,
  ability: Ability,
  rng: Rng,
  casterPoint?: Pos,
): EncounterState {
  let s = state;
  let t = creatureOf(s, targetId);

  for (const c of asList(spell.condition)) {
    const repAbility =
      c.repeatAbility ?? (spell.resolution.kind === 'save' ? spell.resolution.ability : undefined);
    const rep = c.repeatSave && repAbility ? { repeatSave: { ability: repAbility, dc } } : {};
    const before = t;
    t = addCondition(t, c.name, c.rounds, {
      spell: spell.name,
      by: caster.id,
      ...(spell.concentration ? { concentration: true } : {}),
      ...(c.endsOnDamage ? { endsOnDamage: true } : {}),
      ...(c.endsOnAttack ? { endsOnAttack: true } : {}),
      ...rep,
    });
    s = withCreature(s, t);
    s = addLog(
      s,
      t === before
        ? `${t.name} resiste a ${CONDITION_LABEL[c.name]} (${spell.name}).`
        : `${t.name} ficou sob efeito de ${spell.name}.`,
      [t.id],
    );
  }

  if (spell.kill) {
    const cur = creatureOf(s, t.id);
    if (cur.status !== 'dead') {
      s = withCreature(s, { ...cur, status: 'dead', hp: { ...cur.hp, current: 0 } });
      s = addLog(s, `${cur.name} morre na hora (${spell.name}).`, [caster.id, cur.id]);
      s = aftermath(s, cur.id, 0, rng);
    }
  }

  if (spell.dispel) s = dispelOn(s, caster, t.id, slot, ability, rng);

  if (spell.cure?.spells?.length) {
    const names = spell.cure.spells.map((id) => getSpell(id)?.name).filter((n): n is string => !!n);
    let cur = creatureOf(s, t.id);
    const before = (cur.effects ?? []).length + cur.conditions.length;
    cur = removeEffects(
      { ...cur, conditions: cur.conditions.filter((k) => !(k.spell && names.includes(k.spell))) },
      (e) => names.includes(e.name),
    );
    if ((cur.effects ?? []).length + cur.conditions.length < before) {
      s = withCreature(s, cur);
      s = addLog(s, `${cur.name}: ${names.join(', ')} termina.`, [caster.id, cur.id]);
    }
  }

  if (spell.cure?.conditions?.length) {
    let cur = creatureOf(s, t.id);
    const present = spell.cure.conditions.filter((n) => cur.conditions.some((k) => k.name === n));
    const gone = spell.cure.all ? present : present.slice(0, 1);
    for (const n of gone) cur = removeCondition(cur, n);
    if (gone.length) {
      s = withCreature(s, cur);
      s = addLog(s, `${cur.name}: ${gone.map((n) => CONDITION_LABEL[n]).join(', ')} termina.`, [
        caster.id,
        cur.id,
      ]);
    }
  }

  if (spell.effect && spell.effect.to !== 'self') {
    const eff = makeEffect(spell, caster, slot, dc, ability, t.id);
    if (eff) {
      t = addEffect(creatureOf(s, t.id), eff);
      s = withCreature(s, t);
      if (!spell.condition) s = addLog(s, `${t.name}: ${spell.name}.`, [t.id]);
    }
  }

  if (spell.tempHp) {
    const th = spell.tempHp;
    const amount = Math.max(
      0,
      (th.dice ? roll(th.dice, rng).total : 0) +
        flatTemp(spell, slot) +
        (th.addModifier ? abilityMod(caster.abilities[ability]) : 0),
    );
    t = addTempHp(creatureOf(s, t.id), amount);
    s = withCreature(s, t);
    s = addLog(s, `${t.name} ganha ${amount} PV temporários.`, [caster.id, t.id]);
  }

  if (spell.stabilize) {
    const cur = creatureOf(s, t.id);
    if (cur.status === 'dying') {
      s = withCreature(s, {
        ...cur,
        status: 'stable',
        deathSaves: { successes: 0, failures: 0 },
      });
      s = addLog(s, `${cur.name} está estável.`, [caster.id, cur.id]);
    }
  }

  if (spell.push) s = forcedMove(s, t.id, casterPoint ?? tokenOf(s, caster.id)?.pos, spell.push);
  return s;
}

/** Empurra (ou puxa) o alvo em linha reta a partir de `origin`; para ao bater em parede ou criatura. */
export function forcedMove(
  state: EncounterState,
  targetId: string,
  origin: Pos | undefined,
  push: { ft: number; dir?: 'away' | 'toward' },
): EncounterState {
  const tok = tokenOf(state, targetId);
  if (!tok || !origin) return state;
  const t = creatureOf(state, targetId);
  const size = sizeOf(t);
  const dx0 = tok.pos.x - origin.x;
  const dy0 = tok.pos.y - origin.y;
  const len = Math.hypot(dx0, dy0);
  if (len === 0) return state;
  const sign = push.dir === 'toward' ? -1 : 1;
  const ux = (sign * dx0) / len;
  const uy = (sign * dy0) / len;
  const blocked = occupiedCells(state, (c) => c.id !== targetId);
  let pos = tok.pos;
  const steps = Math.floor(push.ft / 5);
  for (let i = 1; i <= steps; i++) {
    const next = { x: tok.pos.x + Math.round(ux * i), y: tok.pos.y + Math.round(uy * i) };
    if (next.x === pos.x && next.y === pos.y) continue;
    if (!canStand(state.map, next, size, blocked)) break;
    pos = next;
  }
  if (pos === tok.pos) return state;
  const moved = {
    ...state,
    tokens: state.tokens.map((x) => (x.creatureId === targetId ? { ...x, pos } : x)),
  };
  return addLog(
    moved,
    `${t.name} é empurrado(a) ${Math.max(...[Math.abs(pos.x - tok.pos.x), Math.abs(pos.y - tok.pos.y)]) * 5} ft.`,
    [targetId],
  );
}

/**
 * Dissipar Magia: cada magia sobre o alvo de nível até o espaço usado acaba; das de nível maior
 * faz-se um teste de atributo de conjuração contra CD 10 + nível da magia.
 */
function dispelOn(
  state: EncounterState,
  caster: Creature,
  targetId: string,
  slot: number,
  ability: Ability,
  rng: Rng,
): EncounterState {
  let s = state;
  const t = creatureOf(s, targetId);
  const levelOf = (name: string, id?: string): number =>
    (id ? getSpell(id)?.level : undefined) ??
    allSpells('2024').find((x) => x.name === name)?.level ??
    9;
  const sources = new Map<string, { name: string; level: number }>();
  for (const e of t.effects ?? [])
    sources.set(e.name, { name: e.name, level: levelOf(e.name, e.spell) });
  for (const k of t.conditions)
    if (k.spell) sources.set(k.spell, { name: k.spell, level: levelOf(k.spell) });
  if (!sources.size) return addLog(s, `${t.name}: nenhuma magia para dissipar.`, [caster.id, t.id]);
  const mod = abilityMod(caster.abilities[ability]);
  const ended: string[] = [];
  for (const src of sources.values()) {
    let ok = src.level <= slot;
    let txt = '';
    if (!ok) {
      const r = rollD20(mod, 'normal', rng);
      ok = r.roll.total >= 10 + src.level;
      txt = ` (teste d20 ${r.natural} ${mod >= 0 ? '+' : ''}${mod} = ${r.roll.total} vs CD ${10 + src.level})`;
    }
    s = addLog(s, `Dissipar Magia contra ${src.name}${txt}: ${ok ? 'termina' : 'resiste'}.`, [
      caster.id,
      t.id,
    ]);
    if (ok) ended.push(src.name);
  }
  if (!ended.length) return s;
  const cur = creatureOf(s, targetId);
  return withCreature(
    s,
    removeEffects(
      { ...cur, conditions: cur.conditions.filter((k) => !(k.spell && ended.includes(k.spell))) },
      (e) => ended.includes(e.name),
    ),
  );
}
