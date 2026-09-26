import { ConditionName, DamageType } from './creature';

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'gear';

/** Definição de um item do catálogo. */
export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Peso em libras. */
  weight: number;
  weapon?: {
    damage: string;
    type: DamageType;
    /** Alcance em pés (5 = corpo a corpo). */
    range: number;
    finesse?: boolean;
    /** Dano empunhada com as duas mãos (sem escudo equipado). */
    versatile?: string;
    ranged?: boolean;
  };
  armor?: {
    base: number;
    /** Quanto do modificador de Destreza conta: tudo, no máximo +2 ou nada. */
    dex: 'full' | 'max2' | 'none';
  };
  /** Bônus de CA do escudo. */
  shield?: number;
  consume?: {
    /** Dados de cura, ex.: "2d4+2". */
    heal?: string;
    cures?: ConditionName;
  };
}

/** Item carregado por uma criatura. */
export interface InventoryItem {
  /** Identificador da instância. */
  id: string;
  /** Id da definição no catálogo. */
  ref: string;
  qty: number;
  equipped: boolean;
}
