import { Ability, ConditionName, DamageType } from './creature';
import { SpellVfx } from './fx';

export type CastTime = 'action' | 'bonus' | 'reaction';

export type SpellTarget =
  | { kind: 'creature' }
  /** Esfera centrada num ponto dentro do alcance. */
  | { kind: 'sphere'; radius: number }
  /** Cone que nasce no conjurador, na direção do ponto escolhido. */
  | { kind: 'cone'; length: number };

export type SpellResolution =
  | { kind: 'attack' }
  | { kind: 'save'; ability: Ability; onSave: 'half' | 'none' }
  /** Sem teste: acerta sempre (Mísseis Mágicos) ou cura. */
  | { kind: 'auto' };

export interface Spell {
  id: string;
  name: string;
  /** 0 = truque. */
  level: number;
  school: string;
  castTime: CastTime;
  /** Alcance em pés (5 = toque). */
  range: number;
  target: SpellTarget;
  resolution: SpellResolution;
  damage?: {
    dice: string;
    type: DamageType;
    /** Dados extras por nível de espaço acima do nível da magia. */
    perLevel?: string;
    /** Truque: escala com o nível do conjurador (5, 11 e 17). */
    cantrip?: boolean;
    /** Repetições do dano (Mísseis Mágicos: 3 dardos + 1 por nível acima do 1º). */
    instances?: { base: number; perLevel: number };
  };
  heal?: { dice: string; perLevel?: string; addModifier?: boolean };
  /** Aplicada em quem falha na salvaguarda (ou em quem é atingido, se for ataque). */
  condition?: { name: ConditionName; rounds: number };
  concentration?: boolean;
  /** Efeito visual no mapa, escrito a partir da descrição desta magia. */
  vfx?: SpellVfx;
  description: string;
}
