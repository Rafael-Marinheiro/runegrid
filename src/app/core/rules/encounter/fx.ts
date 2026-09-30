import { DamageType } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Fx, FxColor, FxPoint } from '../../models/fx';
import { Pos } from '../../models/grid';
import { Spell } from '../../models/spell';
import { creatureOf, sizeOf, tokenOf } from './state';

const DAMAGE_COLOR: Partial<Record<DamageType, FxColor>> = {
  fire: 'fire',
  cold: 'frost',
  lightning: 'lightning',
  necrotic: 'shadow',
  radiant: 'holy',
  acid: 'acid',
  poison: 'poison',
  thunder: 'thunder',
  psychic: 'psychic',
  force: 'force',
};

export const colorOfDamage = (t: DamageType): FxColor => DAMAGE_COLOR[t] ?? 'steel';

/** Centro da criatura no mapa, em células; `null` se ela não está no mapa. */
export function centerOf(state: EncounterState, creatureId: string): FxPoint | null {
  const t = tokenOf(state, creatureId);
  if (!t) return null;
  const half = sizeOf(creatureOf(state, creatureId)) / 2;
  return { x: t.pos.x + half, y: t.pos.y + half };
}

/** Golpe de arma: corpo a corpo = talho na cor do dano; à distância = flecha. */
export function attackFx(
  state: EncounterState,
  actorId: string,
  targetId: string,
  range: number,
  type: DamageType,
): Fx[] {
  const from = centerOf(state, actorId);
  const at = centerOf(state, targetId);
  if (!from || !at) return [];
  return range > 5
    ? [{ kind: 'arrow', from, to: at, color: 'steel' }]
    : [{ kind: 'slash', from, at, color: colorOfDamage(type) }];
}

/** Efeito da magia conforme o `vfx` dela e quem/onde ela atinge. */
export function spellFx(
  state: EncounterState,
  spell: Spell,
  slotLevel: number,
  casterId: string,
  targetIds: string[],
  point?: Pos,
): Fx[] {
  const v = spell.vfx;
  const from = centerOf(state, casterId);
  if (!v || !from) return [];
  const tos = targetIds.flatMap((id) => centerOf(state, id) ?? []);
  const cell = point ? { x: point.x + 0.5, y: point.y + 0.5 } : null;
  const out: Fx[] = [];
  switch (v.kind) {
    case 'bolts': {
      const i = spell.damage?.instances;
      const count = i ? i.base + i.perLevel * Math.max(0, slotLevel - spell.level) : 1;
      for (const to of tos) out.push({ kind: 'bolts', from, to, count, color: v.color });
      break;
    }
    case 'ray':
      for (const to of tos) out.push({ kind: 'ray', from, to, color: v.color });
      break;
    case 'glow':
      for (const at of tos) out.push({ kind: 'glow', at, color: v.color });
      break;
    case 'burst':
      if (spell.target.kind === 'sphere')
        out.push({
          kind: 'burst',
          at: cell ?? from,
          radius: spell.target.radius / 5,
          color: v.color,
        });
      break;
    case 'cone':
      if (spell.target.kind === 'cone' && cell)
        out.push({ kind: 'cone', from, to: cell, length: spell.target.length / 5, color: v.color });
      break;
  }
  if (v.impact) for (const at of tos) out.push({ kind: 'glow', at, color: v.impact });
  return out;
}

/** Pendura os efeitos na primeira linha de registro criada entre `prev` e `next`. */
export function attachFx(prev: EncounterState, next: EncounterState, fx: Fx[]): EncounterState {
  if (!fx.length) return next;
  const i = next.log.findIndex((e) => e.id >= prev.seq);
  if (i < 0) return next;
  return { ...next, log: next.log.map((e, k) => (k === i ? { ...e, fx } : e)) };
}
