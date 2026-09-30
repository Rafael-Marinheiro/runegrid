import { Ability, ConditionName, DamageType } from './creature';
import { EffectMods } from './effect';
import { SpellVfx } from './fx';

/** `long` = mais de uma ação (minutos/horas): não cabe num turno de combate. */
export type CastTime = 'action' | 'bonus' | 'reaction' | 'long';

export type SpellTarget =
  /** Até `max` criaturas (+`perLevel` por espaço acima do nível da magia). */
  | { kind: 'creature'; max?: number; perLevel?: number }
  /** O próprio conjurador. */
  | { kind: 'self' }
  /** Um ponto do mapa (destino de teletransporte, origem de uma zona sem alvo). */
  | { kind: 'point' }
  /** Esfera centrada num ponto dentro do alcance (`self`: nasce no conjurador, como uma aura). */
  | { kind: 'sphere'; radius: number; self?: boolean }
  /** Cone que nasce no conjurador, na direção do ponto escolhido. */
  | { kind: 'cone'; length: number }
  /** Cubo (aresta em pés) centrado num ponto dentro do alcance; `self`: cubo que nasce no conjurador. */
  | { kind: 'cube'; size: number; self?: boolean }
  /** Linha que nasce no conjurador na direção do ponto escolhido. */
  | { kind: 'line'; length: number; width: number };

export type SpellResolution =
  | { kind: 'attack' }
  | { kind: 'save'; ability: Ability; onSave: 'half' | 'none' }
  /** Sem teste: acerta sempre (Mísseis Mágicos), cura ou concede um efeito. */
  | { kind: 'auto' }
  /**
   * Reserva de PV (Sono, Sopro Colorido): rola `dice` (+`perLevel` por espaço acima do nível); as
   * criaturas na área são afetadas da com menos PV para a com mais, enquanto a reserva couber.
   */
  | { kind: 'pool'; dice: string; perLevel?: string };

export interface SpellDamage {
  dice: string;
  type: DamageType;
  /** Dados extras por nível de espaço acima do nível da magia. */
  perLevel?: string;
  /** Dano extra a cada `every` níveis acima do nível da magia (Lâmina de Fogo: 1 a cada 2). */
  every?: number;
  /** Truque: escala com o nível do conjurador (5, 11 e 17). */
  cantrip?: boolean;
  /** Repetições do dano (Mísseis Mágicos: 3 dardos + 1 por nível acima do 1º). */
  instances?: { base: number; perLevel: number };
  /** Quem conjura recupera essa fração do dano causado (Toque Vampírico: 0,5). */
  lifesteal?: number;
  /** Soma o modificador do atributo de conjuração ao dano (Arma Espiritual). */
  addModifier?: boolean;
  /** Ataque de magia que erra ainda causa metade do dano (Flecha Ácida). */
  missHalf?: boolean;
  /** Truque com mais raios conforme o nível do conjurador (Rajada Mística): um ataque por raio. */
  beams?: boolean;
}

export interface SpellCondition {
  name: ConditionName;
  /** Rodadas (0 = até ser removida). */
  rounds: number;
  /** Repete a salvaguarda no fim de cada turno do alvo; passar encerra (Imobilizar Pessoa). */
  repeatSave?: boolean;
  /** Acaba quando quem a tem sofre dano (Sono). */
  endsOnDamage?: boolean;
  /** Acaba quando quem a tem ataca ou conjura (Invisibilidade). */
  endsOnAttack?: boolean;
}

export interface SpellEffect {
  /** Rodadas; se ausente, vem da duração do SRD. */
  rounds?: number;
  /**
   * Quando acaba: no fim (padrão) ou início do turno de quem carrega, ou no início/fim do próximo
   * turno de quem conjurou.
   */
  ends?: 'start' | 'end' | 'casterStart' | 'casterEnd';
  mods: EffectMods;
  /** Modificadores extras a partir do espaço (substituem os campos de `mods`): `{ from: 4, mods: { weaponBonus: 2 } }`. */
  scale?: { from: number; mods: EffectMods }[];
  /** O efeito acaba quando quem o tem sofre dano (Padrão Hipnótico). */
  endsOnDamage?: boolean;
  /** A quem se aplica: ao alvo atingido/que falhou (padrão), só ao conjurador, ou aos dois. */
  to?: 'targets' | 'self' | 'both';
}

/** Repetição a cada turno (Arma Espiritual, Esfera Flamejante, Raio Místico…). */
export interface SpellSustain {
  cost: 'action' | 'bonus';
  /** Campos que mudam ao repetir (alvo, resolução, dano). */
  use?: Partial<
    Pick<Spell, 'target' | 'resolution' | 'damage' | 'extraDamage' | 'condition' | 'range' | 'vfx'>
  >;
}

/** Área que permanece no mapa depois da conjuração (Teia, Névoa Mortal, Guardiões Espirituais). */
export interface SpellZone {
  /** `aura` acompanha o conjurador. */
  aura?: boolean;
  /** Quando aplica o efeito: ao começar o turno de quem está dentro, ao entrar, ou só na conjuração. */
  on: 'start' | 'enter' | 'both' | 'cast';
  /** Raio (pés) da área quando o alvo da magia é um ponto (Esfera Flamejante: 7,5 ft = adjacente). */
  radius?: number;
  /** Terreno difícil (lembrete desenhado no mapa). */
  difficult?: boolean;
  /** Bloqueia visão (Nuvem de Névoa, Escuridão). */
  obscures?: boolean;
  /** Cor do desenho no mapa. */
  color?: SpellVfx['color'];
}

/** Uma escolha que o conjurador faz ao lançar (ver `Spell.options`); a primeira vale se nada for dito. */
export interface SpellOption {
  id: string;
  label: string;
  patch: Partial<
    Pick<Spell, 'effect' | 'condition' | 'damage' | 'extraDamage' | 'tempHp' | 'vfx' | 'manual'>
  >;
}

export interface Spell {
  id: string;
  name: string;
  /** 0 = truque. */
  level: number;
  school: string;
  castTime: CastTime;
  /** Gatilho de uma reação, em texto do SRD. */
  trigger?: string;
  /** Reação que o motor sabe oferecer: ao ser atingido (`acBonus` = CA extra), ao sofrer dano, ou ao ver uma conjuração. */
  react?: { on: 'hit'; acBonus: number } | { on: 'damaged' } | { on: 'cast' };
  /** Alcance em pés (5 = toque, 0 = pessoal). */
  range: number;
  target: SpellTarget;
  resolution: SpellResolution;
  damage?: SpellDamage;
  /** Outros tipos de dano da mesma magia (Tempestade de Gelo: contundente + gélido). */
  extraDamage?: SpellDamage[];
  heal?: {
    dice?: string;
    perLevel?: string;
    flat?: number;
    flatPerLevel?: number;
    addModifier?: boolean;
  };
  /** Encerra as magias do alvo (Dissipar Magia): automático até o espaço usado, acima disso teste de atributo. */
  dispel?: boolean;
  /** Escolhas da conjuração (Proteção contra Energia: tipo de dano); `patch` substitui campos da magia. */
  options?: SpellOption[];
  /** Traz de volta quem morreu há pouco, com 1 PV (Reviver). */
  revive?: boolean;
  /** Encerra condições do alvo (Restauração Menor): uma, ou todas as listadas com `all`. */
  cure?: { conditions?: ConditionName[]; all?: boolean; spells?: string[] };
  /** Estabiliza quem está morrendo (Poupar os Moribundos). */
  stabilize?: boolean;
  /** PV temporários (Vida Falsa, Heroísmo em 2024). */
  tempHp?: { dice?: string; flat?: number; flatPerLevel?: number; addModifier?: boolean };
  /** Aplicada em quem falha na salvaguarda (ou em quem é atingido, se for ataque). */
  condition?: SpellCondition | SpellCondition[];
  /** Efeito ativo com duração (Bênção, Armadura Arcana, Escudo). */
  effect?: SpellEffect;
  /** Empurra (ou puxa) quem falhou. */
  push?: { ft: number; dir?: 'away' | 'toward' };
  /** Teletransporta o conjurador ao ponto escolhido, até `range`. */
  teleport?: boolean;
  concentration?: boolean;
  /** Duração em rodadas, tirada do SRD (1 min = 10). */
  rounds?: number;
  sustain?: SpellSustain;
  /** A conjuração em si não causa o efeito: quem o causa é a repetição (`sustain`) ou a área (`zone`). */
  noInitial?: boolean;
  zone?: SpellZone;
  /** Efeito visual no mapa, escrito a partir da descrição desta magia. */
  vfx?: SpellVfx;
  /** Puramente narrativa: o motor gasta espaço/concentração e registra o texto oficial, nada mais. */
  narrative?: boolean;
  /** Parte do efeito o Mestre resolve (texto dito ao conjurar); o que o motor faz está nos campos acima. */
  manual?: string;
  description: string;
}

/** Mecânica de uma magia em `public/data/spell-rules*.json`; o resto vem do SRD (ver `spells/build`). */
export type SpellRule = Partial<
  Omit<Spell, 'id' | 'name' | 'level' | 'school' | 'description' | 'rounds'>
> & { rounds?: number };
