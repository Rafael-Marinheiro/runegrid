import { InventoryItem } from './item';
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABEL: Record<Ability, string> = {
  str: 'Força',
  dex: 'Destreza',
  con: 'Constituição',
  int: 'Inteligência',
  wis: 'Sabedoria',
  cha: 'Carisma',
};

export const SKILLS = {
  acrobatics: { label: 'Acrobacia', ability: 'dex' },
  animalHandling: { label: 'Adestrar Animais', ability: 'wis' },
  arcana: { label: 'Arcanismo', ability: 'int' },
  athletics: { label: 'Atletismo', ability: 'str' },
  deception: { label: 'Enganação', ability: 'cha' },
  history: { label: 'História', ability: 'int' },
  insight: { label: 'Intuição', ability: 'wis' },
  intimidation: { label: 'Intimidação', ability: 'cha' },
  investigation: { label: 'Investigação', ability: 'int' },
  medicine: { label: 'Medicina', ability: 'wis' },
  nature: { label: 'Natureza', ability: 'int' },
  perception: { label: 'Percepção', ability: 'wis' },
  performance: { label: 'Atuação', ability: 'cha' },
  persuasion: { label: 'Persuasão', ability: 'cha' },
  religion: { label: 'Religião', ability: 'int' },
  sleightOfHand: { label: 'Prestidigitação', ability: 'dex' },
  stealth: { label: 'Furtividade', ability: 'dex' },
  survival: { label: 'Sobrevivência', ability: 'wis' },
} as const satisfies Record<string, { label: string; ability: Ability }>;
export type Skill = keyof typeof SKILLS;
export const SKILL_KEYS = Object.keys(SKILLS) as Skill[];

export type Proficiency = 'proficient' | 'expertise';

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type Size = (typeof SIZES)[number];
export const SIZE_LABEL: Record<Size, string> = {
  tiny: 'Miúdo',
  small: 'Pequeno',
  medium: 'Médio',
  large: 'Grande',
  huge: 'Enorme',
  gargantuan: 'Imenso',
};

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const DAMAGE_LABEL: Record<DamageType, string> = {
  acid: 'Ácido',
  bludgeoning: 'Contundente',
  cold: 'Gélido',
  fire: 'Fogo',
  force: 'Energia',
  lightning: 'Elétrico',
  necrotic: 'Necrótico',
  piercing: 'Perfurante',
  poison: 'Veneno',
  psychic: 'Psíquico',
  radiant: 'Radiante',
  slashing: 'Cortante',
  thunder: 'Trovejante',
};

export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type ConditionName = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<ConditionName, string> = {
  blinded: 'Cego',
  charmed: 'Enfeitiçado',
  deafened: 'Surdo',
  frightened: 'Amedrontado',
  grappled: 'Agarrado',
  incapacitated: 'Incapacitado',
  invisible: 'Invisível',
  paralyzed: 'Paralisado',
  petrified: 'Petrificado',
  poisoned: 'Envenenado',
  prone: 'Caído',
  restrained: 'Contido',
  stunned: 'Atordoado',
  unconscious: 'Inconsciente',
};

export interface ActiveCondition {
  name: ConditionName;
  /** Rodadas restantes, contadas no fim do turno de quem tem a condição. Sem valor = até ser removida. */
  rounds?: number;
}

export type CreatureKind = 'pc' | 'npc' | 'monster';
export type LifeStatus = 'alive' | 'dying' | 'stable' | 'dead';

export interface Resource {
  name: string;
  max: number;
  used: number;
  recharge: 'short' | 'long';
}

export interface Attack {
  name: string;
  /** Bônus de ataque (já inclui atributo e proficiência). */
  bonus: number;
  /** Dado de dano, ex.: "1d8+4". */
  damage: string;
  type: DamageType;
  /** Alcance em pés: 5 corpo a corpo, mais para ataques à distância. */
  range: number;
}

export interface Creature {
  id: string;
  name: string;
  kind: CreatureKind;
  /** Nível (PJ/PNJ). Monstros usam `cr`. */
  level: number;
  cr?: number;
  size: Size;
  /** Deslocamento em pés. */
  speed: number;
  /** Alcance de visão no escuro em pés. Ausente ou zero = sem visão no escuro. */
  darkvision?: number;
  ac: number;
  abilities: Record<Ability, number>;
  saveProficiencies: Ability[];
  skills: Partial<Record<Skill, Proficiency>>;
  hp: { max: number; current: number; temp: number };
  status: LifeStatus;
  deathSaves: { successes: number; failures: number };
  /** Espaços de magia por nível de magia (1–9). */
  spellSlots: Record<number, { max: number; used: number }>;
  resources: Resource[];
  attacks: Attack[];
  /** Conjuração: atributo e magias conhecidas/preparadas (ids de `SPELLS`). */
  spellcasting?: { ability: Ability; spells: string[] };
  /** Ataques por ação Atacar (Ataque Extra). */
  attacksPerAction: number;
  resistances: DamageType[];
  immunities: DamageType[];
  vulnerabilities: DamageType[];
  conditions: ActiveCondition[];
  /** Ícone do token (ver `token-icons`); se ausente, deduzido do nome. */
  icon?: string;
  /** Retrato próprio do token, compactado como data URL local. */
  tokenImage?: string;
  /** Itens carregados (ver `models/item`). */
  inventory?: InventoryItem[];
  /** Magia mantida em concentração. */
  concentration?: string;
}
