import { Ability, CONDITION_LABEL, Creature } from '../../models/creature';
import { ActiveEffect } from '../../models/effect';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Spell, SpellCondition } from '../../models/spell';
import { abilityMod, addCondition, addEffect, addTempHp } from '../creature';
import { roll, Rng } from '../dice';
import { canStand } from '../grid/movement';
import { flatTemp } from '../spells/scaling';
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
  if (mods.repeatSave) mods = { ...mods, repeatSave: { ability, dc } };
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
    const rep =
      c.repeatSave && spell.resolution.kind === 'save'
        ? { repeatSave: { ability: spell.resolution.ability, dc } }
        : {};
    const before = t;
    t = addCondition(t, c.name, c.rounds, {
      spell: spell.name,
      by: caster.id,
      ...(spell.concentration ? { concentration: true } : {}),
      ...(c.endsOnDamage ? { endsOnDamage: true } : {}),
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
