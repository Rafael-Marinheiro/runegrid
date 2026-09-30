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

export function bonusActionsOf(c: Pick<Creature, 'features'>): BonusAction[] {
  return [...new Set((c.features ?? []).flatMap((f) => FEATURES[f]?.bonusActions ?? []))];
}
