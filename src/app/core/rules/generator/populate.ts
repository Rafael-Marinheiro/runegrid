import { DamageType } from '../../models/creature';
import {
  DifficultyId,
  EmphasisId,
  GeneratedTrap,
  EncounterGroup,
  RoomRole,
} from '../../models/adventure';
import { Pos } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { Rng } from '../dice';
import { estimateEncounter } from '../srd/xp';
import { chance, int, pick, shuffle } from './util';
import { TrapTemplate } from './themes';

/** Fração de cada papel entre as salas (fora entrada e chefe). */
const SHARES: Record<EmphasisId, Record<'encounter' | 'trap' | 'treasure' | 'empty', number>> = {
  combat: { encounter: 0.65, trap: 0.1, treasure: 0.1, empty: 0.15 },
  traps: { encounter: 0.35, trap: 0.35, treasure: 0.1, empty: 0.2 },
  exploration: { encounter: 0.3, trap: 0.15, treasure: 0.25, empty: 0.3 },
  mixed: { encounter: 0.5, trap: 0.2, treasure: 0.15, empty: 0.15 },
};

/** Distribui papéis pelas salas comuns (a entrada e o chefe já estão definidos). */
export function assignRoles(count: number, emphasis: EmphasisId, rng: Rng): RoomRole[] {
  const s = SHARES[emphasis];
  const roles: RoomRole[] = [];
  const add = (role: RoomRole, n: number) => roles.push(...Array<RoomRole>(n).fill(role));
  const encounters = Math.round(count * s.encounter);
  const traps = Math.round(count * s.trap);
  const treasures = Math.max(count >= 3 ? 1 : 0, Math.round(count * s.treasure));
  add('encounter', encounters);
  add('trap', traps);
  add('treasure', treasures);
  while (roles.length < count) roles.push('empty');
  return shuffle(rng, roles.slice(0, count));
}

const NEXT: Record<DifficultyId, DifficultyId> = {
  easy: 'medium',
  medium: 'hard',
  hard: 'deadly',
  deadly: 'deadly',
};

/** XP ajustado-alvo de um encontro (o chefe sobe uma faixa). */
export function budgetFor(
  levels: number[],
  difficulty: DifficultyId,
  boss: boolean,
  rng: Rng,
): number {
  const t = estimateEncounter(levels, []).thresholds;
  const base = t[boss ? NEXT[difficulty] : difficulty];
  const spread = boss ? 1 + rng() * 0.3 : 0.75 + rng() * 0.35;
  return Math.round(base * (boss && difficulty === 'deadly' ? 1.3 : 1) * spread);
}

export interface Picked {
  groups: EncounterGroup[];
  adjustedXp: number;
}

/** Procura a combinação de monstro principal + capangas cujo XP ajustado chega mais perto do alvo. */
export function pickEncounter(
  pool: SrdMonster[],
  target: number,
  levels: number[],
  boss: boolean,
  rng: Rng,
): Picked | null {
  const level = Math.max(...levels);
  const usable = pool.filter((m) => m.attacks.length > 0 && m.cr <= level + 2);
  const mains = boss ? usable.filter((m) => m.cr >= Math.max(1, level - 2)) : usable;
  const candidates = mains.length ? mains : usable;
  if (!candidates.length) return null;

  let best = null as (Picked & { diff: number }) | null;
  for (let t = 0; t < 70; t++) {
    const main = pick(rng, candidates);
    const minions = [
      null,
      ...Array.from({ length: 3 }, () =>
        pick(
          rng,
          usable.filter((m) => m.cr <= main.cr),
        ),
      ),
    ].filter((m, i) => i === 0 || m !== undefined);
    for (let n1 = 1; n1 <= (boss ? 2 : 6); n1++) {
      for (const minion of minions) {
        for (let n2 = minion ? 1 : 0; n2 <= (minion ? 6 : 0); n2++) {
          const crs = [
            ...Array<number>(n1).fill(main.cr),
            ...(minion ? Array<number>(n2).fill(minion.cr) : []),
          ];
          const adjustedXp = estimateEncounter(levels, crs).adjustedXp;
          const diff = Math.abs(adjustedXp - target);
          if (!best || diff < best.diff) {
            const groups: EncounterGroup[] = [
              { monsterId: main.id, name: main.name, cr: main.cr, count: n1 },
            ];
            if (minion && n2 > 0)
              groups.push({ monsterId: minion.id, name: minion.name, cr: minion.cr, count: n2 });
            best = { groups: mergeSame(groups), adjustedXp, diff };
          }
        }
      }
    }
    if (best && best.diff <= target * 0.08) break;
  }
  return best ? { groups: best.groups, adjustedXp: best.adjustedXp } : null;
}

function mergeSame(groups: EncounterGroup[]): EncounterGroup[] {
  const out: EncounterGroup[] = [];
  for (const g of groups) {
    const same = out.find((o) => o.monsterId === g.monsterId);
    if (same) same.count += g.count;
    else out.push({ ...g });
  }
  return out;
}

// ---------- armadilhas (severidade do DMG) ----------

const TIER = (level: number) => (level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3);
const DAMAGE: Record<'setback' | 'dangerous' | 'deadly', string[]> = {
  setback: ['1d10', '2d10', '4d10', '10d10'],
  dangerous: ['2d10', '4d10', '10d10', '18d10'],
  deadly: ['4d10', '10d10', '18d10', '24d10'],
};
const DC_RANGE = { setback: [10, 11], dangerous: [12, 15], deadly: [16, 20] } as const;

export function trapSeverity(difficulty: DifficultyId): 'setback' | 'dangerous' | 'deadly' {
  return difficulty === 'easy' ? 'setback' : difficulty === 'deadly' ? 'deadly' : 'dangerous';
}

export function makeTrap(
  template: TrapTemplate,
  level: number,
  difficulty: DifficultyId,
  pos: Pos,
  roomId: string | null,
  rng: Rng,
): GeneratedTrap {
  const sev = trapSeverity(difficulty);
  return {
    roomId,
    name: template.name,
    pos,
    ability: template.ability,
    dc: int(rng, DC_RANGE[sev][0], DC_RANGE[sev][1]),
    damage: DAMAGE[sev][TIER(level)],
    damageType: template.damageType as DamageType,
  };
}

// ---------- tesouro ----------

const GP = [150, 900, 4500, 20000];
const ITEMS = [
  'Poção de cura',
  'Poção de resistência a fogo',
  'Pergaminho de magia (1º nível)',
  'Pergaminho de magia (2º nível)',
  'Adaga +1',
  'Escudo +1',
  'Anel de proteção',
  'Bolsa de gemas',
  'Frasco de fogo alquímico',
];

export function makeTreasure(
  level: number,
  boss: boolean,
  rng: Rng,
): { gp: number; items: string[] } {
  const gp = Math.round(GP[TIER(level)] * (0.7 + rng() * 0.6) * (boss ? 2 : 1));
  const items = shuffle(rng, ITEMS).slice(0, boss ? int(rng, 1, 3) : int(rng, 0, 2));
  return { gp, items: chance(rng, 0.15) && !boss ? [] : items };
}
