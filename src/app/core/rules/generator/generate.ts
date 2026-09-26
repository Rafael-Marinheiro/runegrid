import {
  EncounterGroup,
  GeneratedAdventure,
  GeneratedEncounter,
  GeneratedRoom,
  GeneratedTrap,
  GeneratorParams,
  RoomRole,
  SizeId,
  Treasure,
} from '../../models/adventure';
import { GridMap, Pos, Room, Trap } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { mulberry32, seedFromString } from '../dice';
import { caveLayout, center, dungeonLayout, flood, Layout, openLayout, Rect } from './layout';
import { assignRoles, budgetFor, makeTrap, makeTreasure, pickEncounter } from './populate';
import { Theme, THEME_DATA } from './themes';
import { pick, shuffle } from './util';

interface SizeSpec {
  width: number;
  height: number;
  rooms: number;
  room: { minW: number; maxW: number; minH: number; maxH: number };
}

const SIZE: Record<SizeId, SizeSpec> = {
  small: { width: 36, height: 26, rooms: 5, room: { minW: 4, maxW: 8, minH: 4, maxH: 6 } },
  medium: { width: 56, height: 40, rooms: 10, room: { minW: 4, maxW: 9, minH: 4, maxH: 7 } },
  large: { width: 80, height: 56, rooms: 20, room: { minW: 4, maxW: 10, minH: 4, maxH: 8 } },
};

export const DEFAULT_PARAMS: GeneratorParams = {
  theme: 'crypt',
  size: 'small',
  difficulty: 'hard',
  emphasis: 'mixed',
  partyLevel: 5,
  partySize: 4,
  seed: 'vharos-7f3a',
};

/** Semente numérica derivada de TODOS os parâmetros (mesmos parâmetros → mesma aventura). */
const seedOf = (p: GeneratorParams, salt = ''): number =>
  seedFromString(
    [p.seed, p.theme, p.size, p.difficulty, p.emphasis, p.partyLevel, p.partySize, salt].join('|'),
  );

const themeMonsters = (theme: Theme, all: SrdMonster[]): SrdMonster[] =>
  all.filter(
    (m) =>
      !theme.avoidNames?.test(m.name) &&
      (theme.monsterTypes.some((t) => m.type.toLowerCase().startsWith(t)) ||
        theme.monsterNames?.test(m.name)),
  );

function buildLayout(p: GeneratorParams, theme: Theme, rng: () => number): Layout {
  const s = SIZE[p.size];
  if (theme.layout === 'cave') return caveLayout(s.width, s.height, s.rooms, rng);
  if (theme.layout === 'open' || theme.layout === 'swamp') {
    return openLayout(s.width, s.height, s.rooms, rng, theme.layout === 'swamp');
  }
  return dungeonLayout(s.width, s.height, s.rooms, s.room, rng);
}

/** Conteúdo de uma sala que pode ser travado ao regenerar. */
interface Kept {
  room: GeneratedRoom;
  encounter?: GeneratedEncounter;
  traps: GeneratedTrap[];
  treasure?: Treasure;
}

/**
 * Gera uma aventura completa (mapa + salas + encontros + armadilhas + tesouro + gancho).
 * `monsters` é o bestiário do SRD (dados injetados: o gerador é uma função pura).
 */
export function generateAdventure(
  params: GeneratorParams,
  monsters: SrdMonster[],
): GeneratedAdventure {
  const theme = THEME_DATA[params.theme];
  const layout = buildLayout(params, theme, mulberry32(seedOf(params, 'layout')));
  return fill(layout, params, theme, monsters, mulberry32(seedOf(params, 'content')), new Map());
}

/**
 * Sorteia de novo o conteúdo das salas que não estão travadas, mantendo o mapa e o que foi travado.
 * `nonce` muda o sorteio a cada chamada.
 */
export function regenerate(
  adv: GeneratedAdventure,
  locked: ReadonlySet<string>,
  monsters: SrdMonster[],
  nonce: number,
): GeneratedAdventure {
  const params = adv.params;
  const theme = THEME_DATA[params.theme];
  const layout: Layout = {
    width: adv.map.width,
    height: adv.map.height,
    cells: adv.map.cells,
    rooms: adv.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
  };
  const keep = new Map<string, Kept>();
  for (const r of adv.rooms) {
    if (!locked.has(r.id)) continue;
    keep.set(r.id, {
      room: r,
      encounter: adv.encounters.find((e) => e.roomId === r.id),
      traps: adv.traps.filter((t) => t.roomId === r.id),
      treasure: adv.treasures.find((t) => t.roomId === r.id),
    });
  }
  return fill(
    layout,
    params,
    theme,
    monsters,
    mulberry32(seedOf(params, `content-${nonce}`)),
    keep,
  );
}

function fill(
  layout: Layout,
  params: GeneratorParams,
  theme: Theme,
  allMonsters: SrdMonster[],
  rng: () => number,
  keep: Map<string, Kept>,
): GeneratedAdventure {
  const levels = Array<number>(params.partySize).fill(params.partyLevel);
  const pool = themeMonsters(theme, allMonsters);
  const monstersPool = pool.length >= 3 ? pool : allMonsters;

  // distâncias da entrada: o chefe é a sala mais distante
  const entrance = center(layout.rooms[0]);
  const dist = flood(layout, entrance);
  const distOf = (r: Rect) => dist.get(center(r).y * layout.width + center(r).x) ?? 0;
  const bossIdx =
    layout.rooms.length > 1
      ? layout.rooms.reduce(
          (best, r, i) => (i > 0 && distOf(r) > distOf(layout.rooms[best]) ? i : best),
          1,
        )
      : -1;

  const commons = layout.rooms.map((_, i) => i).filter((i) => i !== 0 && i !== bossIdx);
  const roles = assignRoles(commons.length, params.emphasis, rng);
  const roleOf = new Map<number, RoomRole>([[0, 'entrance']]);
  if (bossIdx > 0) roleOf.set(bossIdx, 'boss');
  commons.forEach((ri, k) => roleOf.set(ri, roles[k]));

  const names = shuffle(rng, theme.roomNames);
  const rooms: GeneratedRoom[] = [];
  const encounters: GeneratedEncounter[] = [];
  const treasures: Treasure[] = [];
  const traps: GeneratedTrap[] = [];
  const secret = new Map<string, string[]>();

  layout.rooms.forEach((rect, i) => {
    const id = `r${i + 1}`;
    const kept = keep.get(id);
    if (kept) {
      rooms.push(kept.room);
      if (kept.encounter) encounters.push(kept.encounter);
      traps.push(...kept.traps);
      if (kept.treasure) treasures.push(kept.treasure);
      return;
    }
    const role = roleOf.get(i)!;
    const feature = pick(rng, theme.features);
    const detail = pick(rng, theme.details);
    const extra =
      role === 'boss'
        ? ' Uma presença poderosa aguarda aqui.'
        : role === 'treasure'
          ? ' Algo brilha entre a poeira.'
          : '';
    const name =
      role === 'entrance'
        ? 'Entrada'
        : role === 'boss'
          ? 'Covil do chefe'
          : names[i % names.length];
    const notes: string[] = [];

    if (role === 'encounter' || role === 'boss') {
      const target = budgetFor(levels, params.difficulty, role === 'boss', rng);
      const picked = pickEncounter(monstersPool, target, levels, role === 'boss', rng);
      if (picked) {
        encounters.push({ roomId: id, groups: picked.groups, adjustedXp: picked.adjustedXp });
        notes.push(
          `Monstros: ${picked.groups.map((g: EncounterGroup) => `${g.count}× ${g.name}`).join(', ')} (${picked.adjustedXp} XP)`,
        );
      }
    }
    if (role === 'trap' || role === 'boss' || (role === 'encounter' && rng() < 0.15)) {
      const t = makeTrap(
        pick(rng, theme.traps),
        params.partyLevel,
        params.difficulty,
        spot(rect, rng),
        id,
        rng,
      );
      traps.push(t);
      notes.push(`Armadilha: ${t.name} (CD ${t.dc} ${t.ability.toUpperCase()}, ${t.damage})`);
    }
    if (role === 'treasure' || role === 'boss') {
      const loot = makeTreasure(params.partyLevel, role === 'boss', rng);
      treasures.push({ roomId: id, ...loot });
      notes.push(`Tesouro: ${loot.gp} po${loot.items.length ? `, ${loot.items.join(', ')}` : ''}`);
    }
    secret.set(id, notes);
    rooms.push({ id, name, description: `${feature} ${detail}${extra}`, role, ...rect });
  });

  // corredores armados quando a ênfase é armadilhas
  if (params.emphasis === 'traps') {
    for (const t of corridorSpots(layout, rng, Math.max(1, Math.round(layout.rooms.length / 4)))) {
      traps.push(
        makeTrap(pick(rng, theme.traps), params.partyLevel, params.difficulty, t, null, rng),
      );
    }
  }

  const mapRooms: Room[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    notes: (secret.get(r.id) ?? []).join(' | '),
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
  }));
  const mapTraps: Trap[] = traps.map((t, i) => ({
    id: `t${i + 1}`,
    name: t.name,
    pos: t.pos,
    ability: t.ability,
    dc: t.dc,
    damage: t.damage,
    damageType: t.damageType,
    hidden: true,
    triggered: false,
  }));
  const first = layout.rooms[0];
  // névoa em tudo, exceto a sala de entrada (com uma célula de margem)
  const fog = layout.cells.map((_, k) => {
    const x = k % layout.width;
    const y = Math.floor(k / layout.width);
    return !(
      x >= first.x - 1 &&
      x <= first.x + first.w &&
      y >= first.y - 1 &&
      y <= first.y + first.h
    );
  });
  const map: GridMap = {
    width: layout.width,
    height: layout.height,
    cells: layout.cells,
    fog,
    rooms: mapRooms,
    traps: mapTraps,
  };

  const name = `${pick(rng, theme.namePrefix)} ${pick(rng, theme.nameSuffix)}`;
  const place = name.split(' ').slice(-1)[0];
  return {
    params,
    name,
    hook: pick(rng, theme.hooks).replace('{n}', place),
    map,
    rooms,
    encounters,
    treasures,
    traps,
    entrance,
    totalXp: encounters.reduce((s, e) => s + e.adjustedXp, 0),
  };
}

/** Uma célula de piso dentro da sala (longe das bordas quando possível). */
function spot(r: Rect, rng: () => number): Pos {
  return {
    x: r.x + 1 + Math.floor(rng() * Math.max(1, r.w - 2)),
    y: r.y + 1 + Math.floor(rng() * Math.max(1, r.h - 2)),
  };
}

/** Células de corredor (piso fora das salas com paredes em frente e atrás). */
function corridorSpots(l: Layout, rng: () => number, n: number): Pos[] {
  const inRoom = (x: number, y: number) =>
    l.rooms.some((r) => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h);
  const wall = (x: number, y: number) => l.cells[y * l.width + x] === 'wall';
  const spots: Pos[] = [];
  for (let y = 1; y < l.height - 1; y++) {
    for (let x = 1; x < l.width - 1; x++) {
      if (l.cells[y * l.width + x] !== 'floor' || inRoom(x, y)) continue;
      if ((wall(x - 1, y) && wall(x + 1, y)) || (wall(x, y - 1) && wall(x, y + 1)))
        spots.push({ x, y });
    }
  }
  return shuffle(rng, spots).slice(0, n);
}
