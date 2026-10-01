import { DamageType } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Fx, FxColor, FxPoint, FxStrike } from '../../models/fx';
import { Pos } from '../../models/grid';
import { Spell } from '../../models/spell';
import { rayCount } from '../spells/scaling';
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

/** Forma do golpe pelo nome do ataque (mordida, garra, pancada…) ou, sem pista, pelo tipo de dano. */
function strikeStyle(name: string, type: DamageType): { style?: FxStrike } {
  const n = name.toLowerCase();
  if (/bite|chomp|tusk|gore|fang/.test(n)) return { style: 'bite' };
  if (/claw|talon|rend|shred|scratch|rake/.test(n)) return { style: 'claw' };
  if (
    /slam|fist|hoof|hooves|tail|ram|club|maul|hammer|pummel|crush|stomp|pseudopod|mace|stone|rock/.test(
      n,
    )
  )
    return { style: 'bash' };
  if (/sting|spear|pike|lance|dagger|horn|beak|tentacle/.test(n)) return { style: 'pierce' };
  if (type === 'bludgeoning') return { style: 'bash' };
  if (type === 'piercing') return { style: 'pierce' };
  return {};
}

/** Golpe de arma: corpo a corpo = talho na cor do dano; à distância = flecha. */
export function attackFx(
  state: EncounterState,
  actorId: string,
  targetId: string,
  range: number,
  type: DamageType,
  weaponName = '',
): Fx[] {
  const from = centerOf(state, actorId);
  const at = centerOf(state, targetId);
  if (!from || !at) return [];
  return range > 5
    ? [{ kind: 'arrow', from, to: at, color: 'steel' }]
    : [{ kind: 'slash', from, at, color: colorOfDamage(type), ...strikeStyle(weaponName, type) }];
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
  const t = spell.target;
  const out: Fx[] = [];
  switch (v.kind) {
    case 'bolts': {
      const caster = creatureOf(state, casterId);
      const level =
        caster.kind === 'monster' ? Math.max(1, Math.ceil(caster.cr ?? 1)) : caster.level;
      const total =
        spell.damage?.instances || spell.damage?.beams ? rayCount(spell, slotLevel, level) : 1;
      // os dardos/raios se repartem entre os alvos, como no motor
      tos.forEach((to, i) => {
        const count = Math.max(
          1,
          Math.floor(total / tos.length) + (i < total % tos.length ? 1 : 0),
        );
        out.push({ kind: 'bolts', from, to, count: total === 1 ? 1 : count, color: v.color });
      });
      break;
    }
    case 'ray':
      if (t.kind === 'line' && cell) {
        const dx = cell.x - from.x;
        const dy = cell.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = t.length / 5;
        out.push({
          kind: 'ray',
          from,
          to: { x: from.x + (dx / len) * reach, y: from.y + (dy / len) * reach },
          color: v.color,
          width: t.width / 5,
        });
      } else for (const to of tos) out.push({ kind: 'ray', from, to, color: v.color });
      break;
    case 'glow':
      if (spell.teleport && cell) {
        out.push(
          { kind: 'glow', at: from, color: v.color },
          { kind: 'glow', at: cell, color: v.color },
        );
      } else if (t.kind === 'point' && cell) out.push({ kind: 'glow', at: cell, color: v.color });
      else
        for (const at of tos.length ? tos : [from]) out.push({ kind: 'glow', at, color: v.color });
      break;
    case 'burst': {
      const areaFt =
        t.kind === 'sphere'
          ? t.radius
          : t.kind === 'cube'
            ? t.self
              ? t.size
              : t.size / 2
            : (v.radius ?? 10);
      const selfOrigin = (t.kind === 'sphere' || t.kind === 'cube') && t.self;
      const at = !cell || selfOrigin || t.kind === 'self' ? from : cell;
      out.push({ kind: 'burst', at, radius: (v.radius ?? areaFt) / 5, color: v.color });
      break;
    }
    case 'cone':
      if (cell)
        out.push({
          kind: 'cone',
          from,
          to: cell,
          length:
            (t.kind === 'cone' ? t.length : t.kind === 'cube' ? t.size : (v.radius ?? 15)) / 5,
          color: v.color,
        });
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
