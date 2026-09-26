/** XP por nível de desafio (DMG). */
const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '0.125': 25,
  '0.25': 50,
  '0.5': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

export const xpForCr = (cr: number): number => XP_BY_CR[String(cr)] ?? 0;

/** Limiares de XP por personagem: fácil, médio, difícil, mortal (nível 1 a 20). */
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/** Multiplicador por quantidade de monstros; grupos pequenos sobem uma faixa, grandes descem. */
const MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4];

function multiplier(monsters: number, partySize: number): number {
  const band =
    monsters <= 1
      ? 0
      : monsters === 2
        ? 1
        : monsters <= 6
          ? 2
          : monsters <= 10
            ? 3
            : monsters <= 14
              ? 4
              : 5;
  const shift = partySize < 3 ? 1 : partySize >= 6 ? -1 : 0;
  return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, band + shift))];
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

export interface EncounterEstimate {
  /** XP dos monstros somado. */
  baseXp: number;
  /** XP ajustado pelo multiplicador (é o que se compara com os limiares). */
  adjustedXp: number;
  thresholds: { easy: number; medium: number; hard: number; deadly: number };
  difficulty: Difficulty;
}

export function estimateEncounter(partyLevels: number[], monsterCrs: number[]): EncounterEstimate {
  const t = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const lv of partyLevels) {
    const row = THRESHOLDS[Math.min(20, Math.max(1, Math.floor(lv))) - 1];
    t.easy += row[0];
    t.medium += row[1];
    t.hard += row[2];
    t.deadly += row[3];
  }
  const baseXp = monsterCrs.reduce((sum, cr) => sum + xpForCr(cr), 0);
  const adjustedXp = Math.round(baseXp * multiplier(monsterCrs.length, partyLevels.length));
  const difficulty: Difficulty =
    adjustedXp >= t.deadly
      ? 'deadly'
      : adjustedXp >= t.hard
        ? 'hard'
        : adjustedXp >= t.medium
          ? 'medium'
          : adjustedXp >= t.easy
            ? 'easy'
            : 'trivial';
  return { baseXp, adjustedXp, thresholds: t, difficulty };
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  deadly: 'Mortal',
};
