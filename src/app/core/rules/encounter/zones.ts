import { EncounterState, Zone } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { Spell } from '../../models/spell';
import { inCone, inCube, inLine, inSphere } from '../grid/area';
import { creatureOf, sizeOf, tokenOf } from './state';

/** A criatura em `pos` está dentro da área `t` (origem do conjurador em `origin`, ponto escolhido `point`)? */
export function inArea(
  _state: EncounterState | null,
  t: Spell['target'],
  origin: Pos,
  originSize: number,
  point: Pos,
  pos: Pos,
  size: number,
): boolean {
  switch (t.kind) {
    case 'sphere':
      return inSphere(t.self ? origin : point, t.radius, pos, size);
    case 'cube':
      // cubo que nasce no conjurador: aproximado por um cone do mesmo comprimento
      return t.self
        ? inCone(origin, originSize, point, t.size, pos, size)
        : inCube(point, t.size, pos, size);
    case 'cone':
      return inCone(origin, originSize, point, t.length, pos, size);
    case 'line':
      return inLine(origin, originSize, point, t.length, t.width, pos, size);
    default:
      return false;
  }
}

/** Registra a área que a magia deixa no mapa. */
export function createZone(
  state: EncounterState,
  spell: Spell,
  slotLevel: number,
  casterId: string,
  point: Pos,
  ruleset?: '2014' | '2024',
): EncounterState {
  const z = spell.zone;
  if (!z) return state;
  const caster = tokenOf(state, casterId);
  const fromCaster = z.aura || spell.target.kind === 'line' || spell.target.kind === 'cone';
  const id = (state.zones ?? []).reduce((n, x) => Math.max(n, x.id), 0) + 1;
  const zone: Zone = {
    id,
    spellId: spell.id,
    name: spell.name,
    casterId,
    slotLevel,
    ...(ruleset ? { ruleset } : {}),
    shape:
      spell.target.kind === 'creature' || spell.target.kind === 'point'
        ? { kind: 'sphere', radius: z.radius ?? 5 }
        : spell.target,
    center: fromCaster && caster ? caster.pos : point,
    ...(fromCaster ? { toward: point } : {}),
    ...(z.aura ? { aura: true } : {}),
    on: z.on,
    ...(spell.rounds ? { rounds: spell.rounds } : {}),
    ...(spell.concentration ? { concentration: true } : {}),
    ...(z.difficult ? { difficult: true } : {}),
    ...(z.obscures ? { obscures: true } : {}),
    ...(z.color ? { color: z.color } : {}),
  };
  return {
    ...state,
    zones: [
      ...(state.zones ?? []).filter((x) => !(x.casterId === casterId && x.spellId === spell.id)),
      zone,
    ],
  };
}

/** A criatura está dentro da zona agora? (A aura acompanha o conjurador.) */
export function zoneContains(state: EncounterState, zone: Zone, creatureId: string): boolean {
  const tok = tokenOf(state, creatureId);
  const caster = tokenOf(state, zone.casterId);
  if (!tok) return false;
  const c = creatureOf(state, creatureId);
  if (zone.aura && creatureId === zone.casterId) return false;
  const origin = zone.aura && caster ? caster.pos : zone.center;
  const originSize = zone.aura ? sizeOf(creatureOf(state, zone.casterId)) : 1;
  return inArea(state, zone.shape, origin, originSize, zone.toward ?? origin, tok.pos, sizeOf(c));
}
