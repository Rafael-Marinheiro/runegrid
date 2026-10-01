import { Creature, FeatureId } from '../../models/creature';

/** Ações que uma característica permite fazer como ação bônus. */
export type BonusAction = 'dash' | 'disengage' | 'hide';

/**
 * Características que o motor entende (F12). Uma por vez, com efeito mecânico real; o texto livre
 * das habilidades continua só descritivo.
 */
export const FEATURES: Record<
  FeatureId,
  { pt: string; en: string; bonusActions: readonly BonusAction[] }
> = {
  'sneak-attack': { pt: 'Ataque Furtivo (ladino)', en: 'Sneak Attack (rogue)', bonusActions: [] },
  rage: { pt: 'Fúria (bárbaro)', en: 'Rage (barbarian)', bonusActions: [] },
  'second-wind': {
    pt: 'Retomar o Fôlego (guerreiro)',
    en: 'Second Wind (fighter)',
    bonusActions: [],
  },
  'action-surge': {
    pt: 'Surto de Ação (guerreiro)',
    en: 'Action Surge (fighter)',
    bonusActions: [],
  },
  'cunning-action': {
    pt: 'Ação Astuta (ladino)',
    en: 'Cunning Action (rogue)',
    bonusActions: ['dash', 'disengage', 'hide'],
  },
  'nimble-escape': {
    pt: 'Fuga Ágil (goblin)',
    en: 'Nimble Escape (goblin)',
    bonusActions: ['disengage', 'hide'],
  },
};

export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];

/** Traço do SRD (nome em inglês) → característica que o motor entende. */
export const FEATURE_BY_TRAIT: Record<string, FeatureId> = {
  'Nimble Escape': 'nimble-escape',
  'Cunning Action': 'cunning-action',
};

export function bonusActionsOf(c: Pick<Creature, 'features' | 'effects'>): BonusAction[] {
  return [
    ...new Set([
      ...(c.features ?? []).flatMap((f) => FEATURES[f]?.bonusActions ?? []),
      ...(c.effects ?? []).flatMap((e) => e.mods.bonusActions ?? []),
    ]),
  ];
}

/** Habilidades de classe com usos limitados (F12, fase 4); o recurso correspondente vive em `Creature.resources`. */
export type LimitedFeature = 'second-wind' | 'action-surge' | 'rage';

export const LIMITED_FEATURES: readonly LimitedFeature[] = ['second-wind', 'action-surge', 'rage'];

export const FEATURE_RESOURCE: Record<
  LimitedFeature,
  { name: string; recharge: 'short' | 'long' }
> = {
  'second-wind': { name: 'Retomar o Fôlego', recharge: 'short' },
  'action-surge': { name: 'Surto de Ação', recharge: 'short' },
  rage: { name: 'Fúria', recharge: 'long' },
};

/** Usos por descanso, pelo nível (tabelas do SRD 5.1; o nível do PJ vale como nível da classe). */
export function featureUses(id: LimitedFeature, level: number): number {
  if (id === 'second-wind') return 1;
  if (id === 'action-surge') return level >= 17 ? 2 : 1;
  // Fúria: 2 (nível 1–2), 3 (3–5), 4 (6–11), 5 (12–16), 6 (17–19), ilimitada no 20
  if (level >= 20) return 99;
  return level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
}

/** Dano extra da Fúria em golpes corpo a corpo: +2 até o nível 8, +3 até o 15, +4 depois. */
export const rageDamage = (level: number): number => (level >= 16 ? 4 : level >= 9 ? 3 : 2);

/** Dados do Ataque Furtivo: 1d6 por dois níveis (arredondado para cima). */
export const sneakAttackDice = (level: number): string => `${Math.max(1, Math.ceil(level / 2))}d6`;

/** Garante o recurso da habilidade (com o máximo do nível atual); os usos gastos se mantêm. */
export function withFeatureResource(c: Creature, id: LimitedFeature): Creature {
  const { name, recharge } = FEATURE_RESOURCE[id];
  const max = featureUses(id, c.level);
  const have = c.resources.find((r) => r.name === name);
  return {
    ...c,
    resources: have
      ? c.resources.map((r) => (r === have ? { ...r, max, recharge } : r))
      : [...c.resources, { name, max, used: 0, recharge }],
  };
}
