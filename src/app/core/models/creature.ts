import { ActiveEffect } from './effect';
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
  /** Magia que a impôs (ao acabar a concentração dela, a condição some) e quem a conjurou. */
  spell?: string;
  by?: string;
  concentration?: boolean;
  /** No fim de cada turno de quem a tem, repete a salvaguarda; passar encerra a condição. */
  repeatSave?: { ability: Ability; dc: number };
  /** Acaba quando quem a tem sofre dano (Sono). */
  endsOnDamage?: boolean;
  /** Acaba quando quem a tem ataca ou conjura (Invisibilidade). */
  endsOnAttack?: boolean;
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
  /** Arma com acuidade (vale para o Ataque Furtivo, junto com as de distância). */
  finesse?: boolean;
  /** Dano adicional do mesmo golpe, de outro tipo (Espada Voadora: radiante). */
  extra?: { damage: string; type: DamageType }[];
}

export type FeatureId =
  'cunning-action' | 'nimble-escape' | 'sneak-attack' | 'rage' | 'second-wind' | 'action-surge';

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
  /** Outras velocidades em pés (a de caminhada é `speed`): voo, natação, escalada, escavar; `hover` = paira. */
  speeds?: { fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
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
  /** Características com efeito mecânico no motor (ver `rules/creature/features`). */
  features?: FeatureId[];
  /** Id do monstro do SRD de origem: dele vêm as habilidades ativas (ver `rules/monsters`). */
  srdId?: string;
  /** Estado das habilidades de monstro: usos gastos e recarga pendente, por id da habilidade. */
  abilityState?: Record<string, { used?: number; recharging?: boolean }>;
  /** Último dano sofrido (tipo e se foi crítico): Fortitude de Morto-vivo olha para ele. */
  lastHit?: { type?: DamageType; crit?: boolean; reverted?: boolean };
  /** Regeneração suspensa até o início do próximo turno (dano de ácido/fogo no troll). */
  regenBlocked?: boolean;
  /** Ações lendárias: máximo por rodada e as que restam (volta ao começar o turno do monstro). */
  legendary?: { max: number; left: number };
  /** Forma assumida (Mudar de Forma): a ficha original fica guardada para voltar. */
  form?: {
    id: string;
    label: string;
    labelEn: string;
    keys: string[];
    noActions?: boolean;
    /** Só volta à forma verdadeira com PV acima de 0 (a névoa da Fuga Nebulosa). */
    noRevert?: boolean;
    /** Não conjura (Metamorfose). */
    noSpells?: boolean;
    /** O equipamento se funde à forma e não pode ser usado (Metamorfose). */
    meldsGear?: boolean;
    /** Como os PV da forma entram: troca ou PV temporários; a forma acaba se zerarem. */
    hp?: 'replace' | 'temp';
    /** Quem mantém a concentração que sustenta a forma. */
    by?: { id: string; spell: string };
    original: Pick<
      Creature,
      | 'size'
      | 'speed'
      | 'ac'
      | 'attacksPerAction'
      | 'resistances'
      | 'immunities'
      | 'vulnerabilities'
      | 'darkvision'
      | 'abilities'
      | 'attacks'
      | 'hp'
      | 'speeds'
    >;
  };
  /** Gritando (Fungo Gritador): rodadas que ainda faltam depois que o incômodo some; `-1` enquanto há alguém perto. */
  shrieking?: number;
  /** No plano Etéreo: só interage com quem também está nele; o token fica a 50% de opacidade. */
  plane?: 'ethereal';
  /** Criatura invocada: quem a invocou, por qual magia e quanto tempo falta (ver `encounter/summon`). */
  summon?: {
    by: string;
    spell: string;
    /** Rodadas restantes (conta no fim do turno de quem invocou); ausente = sem prazo. */
    rounds?: number;
    /** Some junto com a concentração de quem invocou. */
    concentration?: boolean;
    onBreak?: 'vanish' | 'hostile';
    corpse?: boolean;
    /** Chave de invocação única (Familiar, Montaria). */
    unique?: string;
    /** Some se quem invocou ficar incapacitado. */
    endsIfOwnerIncapacitated?: boolean;
    /** Some se ficar mais longe de quem invocou do que isto, em pés. */
    leashFt?: number;
    /** Guarda: no início de cada turno de quem invocou, ataca um inimigo a até 5 ft (Cão Fiel). */
    guard?: {
      mode: 'attack' | 'save';
      dice: string;
      type: DamageType;
      bonus?: number;
      /** Quem invocou o move com a ação Magia (2024): ver o comando `moveSummon`. */
      movable?: boolean;
    };
    /** CD de magia de quem invocou, para as habilidades da criatura que pedem salvaguarda. */
    dc?: number;
  };
  /** Ícone do token (ver `token-icons`); se ausente, deduzido do nome. */
  icon?: string;
  /** Retrato próprio do token, compactado como data URL local. */
  tokenImage?: string;
  /** Miniatura estática do catálogo (`miniaturas/x.png`, relativa a `data/`); `tokenImage` tem prioridade. */
  tokenArt?: string;
  /** Itens carregados (ver `models/item`). */
  inventory?: InventoryItem[];
  /** Magia mantida em concentração. */
  concentration?: string;
  /** Efeitos de magias ativos (Bênção, Escudo Arcano, Armadura Arcana…). */
  effects?: ActiveEffect[];
  /** Magias que continuam agindo a cada turno (Arma Espiritual, Esfera Flamejante) e o espaço usado. */
  sustained?: {
    spellId: string;
    slotLevel: number;
    rounds?: number;
    /** Quem conjurou, se não for quem usa (Sopro do Dragão: o alvo sopra, a CD é do conjurador). */
    by?: string;
    /** Escolha feita ao conjurar (tipo de dano do sopro). */
    option?: string;
  }[];
}
