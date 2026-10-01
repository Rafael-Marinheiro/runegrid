import { Ability, ConditionName, DamageType, Size } from './creature';
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
  /** Atributo da salvaguarda repetida quando a magia em si não tem salvaguarda (Palavra de Poder: Atordoar). */
  repeatAbility?: Ability;
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
  /** `free`: sem gastar ação (mover a alcateia de Conjurar Animais junto com o deslocamento). */
  cost: 'action' | 'bonus' | 'free';
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
  /** Ao mover a área (ação de repetição), quem fica dentro refaz o efeito (Raio de Lua, 2024). */
  onMove?: boolean;
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
  /** Rótulo em inglês, se diferir. */
  labelEn?: string;
  patch: Partial<
    Pick<
      Spell,
      | 'effect'
      | 'condition'
      | 'damage'
      | 'extraDamage'
      | 'tempHp'
      | 'vfx'
      | 'manual'
      | 'manualEn'
      | 'summon'
      | 'form'
    >
  >;
}

/**
 * Habilidade de monstro (F13): uma `Spell` de nível 0 com esta marca. Não gasta espaço; o custo é a
 * ação (ou ação bônus/lendária), e a recarga ou os usos por dia valem por criatura.
 */
export interface AbilityMeta {
  cost: 'action' | 'bonus' | 'reaction' | 'legendary' | 'free' | 'death';
  /** Custo em ações lendárias (padrão 1). */
  legendary?: number;
  /** Habilidades que dividem a mesma recarga/usos (as opções de "Sopros"): chave comum do estado. */
  group?: string;
  /** "Recharge 5-6": no início do turno do monstro, d6 maior ou igual a isto a devolve. */
  recharge?: number;
  /** "3/Day", "Recharges after a Short or Long Rest" (`rest`). */
  uses?: { n: number; per: 'day' | 'rest' };
  /** CD fixa das salvaguardas do texto do monstro. */
  dc?: number;
  /** Bônus fixo do ataque do texto do monstro. */
  attackBonus?: number;
  /**
   * Consequência extra dos golpes do ataque de arma com este nome (mordida envenenada, agarrar…):
   * não é usada sozinha, vai junto com o ataque (ver `Attack`).
   */
  rider?: string;
  /** Rider que só vale se o monstro se moveu ao menos tanto neste turno (Investida, Bote). */
  moveFt?: number;
  /** Faz um ataque de arma comum do monstro (nome do ataque no SRD) em vez de um efeito próprio (ação lendária: Ataque de Cauda). */
  attack?: string;
  /** Resolve como esta magia do SRD (Medo, Passo Nebuloso…), sem gastar espaço; `level` = a versão de nível mais alto citada no texto. */
  spell?: { id: string; level?: number };
  /** Só afeta quem está agarrado por este monstro (Engolir, Esmagar). */
  needsGrappled?: boolean;
  /** É a ação de mesmo efeito de outra habilidade do monstro (slug): ação lendária "usa Tempestade Relâmpago". */
  invoke?: string;
}

/** Depois de um acerto: salvaguarda do alvo com dano e/ou condição (ataque com veneno, paralisia…). */
export interface SpellOnHitSave {
  ability: Ability;
  /** Quem falha tem os PV máximos reduzidos pelo dano que o golpe causou (até um descanso longo). */
  drainMaxHp?: boolean;
  /** `negate`: passar anula tudo; `half`: metade do dano; `none`: sem dano mas a condição não vale. */
  onSave: 'half' | 'none';
  damage?: SpellDamage;
  extraDamage?: SpellDamage[];
  condition?: SpellCondition | SpellCondition[];
  effect?: SpellEffect;
}

/**
 * Mudança de forma (Vampiro: morcego/névoa; Lobisomem: híbrido/lobo): troca tamanho, velocidade, CA e os
 * ataques permitidos (pelo "(… Form Only)" do nome do ataque) até voltar à forma verdadeira.
 */
export interface FormSpec {
  id: string;
  /** Nome da forma nos dois idiomas, para o registro e a lista. */
  label: string;
  labelEn: string;
  size?: Size;
  /** Deslocamento da forma (o voo conta como deslocamento: o motor não separa voo de caminhada). */
  speed?: number;
  ac?: number;
  attacksPerAction?: number;
  /** Palavras da lista "(Wolf or Hybrid Form Only)" que esta forma aceita; vazio = nenhum ataque. */
  keys?: string[];
  /** Resistência a todo dano (névoa). */
  resistAll?: boolean;
  /** Não pode agir nem usar ação bônus (névoa). */
  noActions?: boolean;
  /** Volta à forma verdadeira. */
  revert?: boolean;
  /** Criatura do SRD cuja ficha serve de modelo (Mudar de Forma dos dragões metálicos: fera ou humanoide). */
  srd?: string;
  /** O que da ficha do modelo substitui o do monstro. */
  take?: FormTake[];
  /** Ataques do monstro que continuam se o modelo também tem um de mesmo nome (a Mordida do couatl). */
  keepAttacks?: string[];
}

export type FormTake =
  | 'size'
  | 'speed'
  | 'ac'
  | 'str'
  | 'dex'
  | 'con'
  /** Os ataques do modelo no lugar dos do monstro. */
  | 'attacks'
  /** Os ataques do modelo somados aos do monstro. */
  | 'attacksAdd'
  /** Resistências, imunidades e vulnerabilidades. */
  | 'resist'
  /** Visão no escuro. */
  | 'senses';

/** Opções de forma geradas a partir do Bestiário: criaturas dos tipos dados com ND até `maxCr`. */
export interface FormFrom {
  types: string[];
  maxCr: number;
  take: FormTake[];
  keepAttacks?: string[];
}

/** Invocação: criaturas do SRD que aparecem no mapa (Conjurar Animais, Familiar, Convocar Demônio…). */
export interface SummonSpec {
  /** Id da criatura no SRD (sem o prefixo do conjunto); vem da opção escolhida ao conjurar. */
  srd?: string;
  /** Quantas aparecem com o espaço base. */
  n?: number;
  /** Ficha montada na hora, escalando com o espaço (Corcel de Outro Mundo); `srd` é o tipo (celestial|fey|fiend; acid|cold|fire|lightning|poison). */
  custom?: 'otherworldly-steed' | 'draconic-spirit' | 'faithful-hound' | 'animated-chain';
  /** O token fica oculto para quem não o invocou (Cão Fiel: invisível para todos menos você). */
  hidden?: boolean;
  /** Some se a distância até quem invocou passar disto, em pés (Cão Fiel: 100 ft no 2014, 300 ft no 2024). */
  leashFt?: number;
  /** Em vez de `n` fixo, quantas aparecem é rolado ("1d8 vrocks"). */
  dice?: string;
  /** No máximo tantas criaturas suas deste tipo ao mesmo tempo (Criar Espectro: sete). */
  cap?: number;
  /** As invocadas não repetem a invocação ("não pode invocar outros demônios"). */
  blockSelf?: boolean;
  /** Mais criaturas com espaços maiores (Conjurar Animais: o dobro no 5º, o triplo no 7º…). */
  countScale?: { from: number; mult: number }[];
  /** Criaturas a mais por nível de espaço acima de `from` (Animar Mortos: duas a mais por nível). */
  extraPerLevel?: { from: number; add: number };
  /** ND máximo da criatura: `base` no nível `from`, +1 por nível acima. */
  maxCr?: { base: number; from: number };
  /** Se a concentração quebra: some (padrão) ou fica hostil (Conjurar Elemental/Fada). */
  onBreak?: 'vanish' | 'hostile';
  /** Continua depois da duração e da concentração (Animar Mortos, Criar Mortos-vivos, Familiar). */
  permanent?: boolean;
  /** Ao chegar a 0 PV fica no mapa como cadáver, em vez de sumir (mortos-vivos, demônios). */
  corpse?: boolean;
  /** Chave de uma invocação única: conjurar de novo troca a anterior (Familiar, Montaria). */
  unique?: string;
  /** Rodadas até sumir sozinhas (1 min = 10); se ausente vale a duração da magia. */
  rounds?: number;
  /** Chance (0–1) de a invocação funcionar (Convocar Demônio, Convocar Mefits). */
  chance?: number;
  /** Sorteia a criatura entre estas, em vez de usar `srd` (Convocar Demônio). */
  pick?: { srd: string; weight?: number }[];
}

export interface Spell {
  id: string;
  name: string;
  /** Nome em inglês quando não vem do glossário (habilidades de monstro). */
  nameEn?: string;
  /** Habilidade de monstro (ver `AbilityMeta`). */
  ability?: AbilityMeta;
  /** Salvaguarda depois de um acerto de ataque (monstros). */
  onHitSave?: SpellOnHitSave;
  /** 0 = truque. */
  level: number;
  school: string;
  castTime: CastTime;
  /** Gatilho de uma reação, em texto do SRD. */
  trigger?: string;
  /** Reação que o motor sabe oferecer: ao ser atingido (`acBonus` = CA extra), ao sofrer dano, ou ao ver uma conjuração. */
  react?:
    | { on: 'hit'; acBonus: number; melee?: boolean }
    | { on: 'damaged' }
    | { on: 'cast'; save?: boolean };
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
    /** O valor fixo é uma reserva dividida entre os alvos, na ordem (Cura Completa em Massa). */
    pool?: boolean;
  };
  /** Só afeta quem tem esses PV atuais ou menos (Palavra de Poder: Matar); os demais ficam ilesos. */
  ifHpAtMost?: number;
  /** Mata o alvo na hora (Palavra de Poder: Matar, Palavra Divina). */
  kill?: boolean;
  /**
   * Efeito que depende de um número por alvo: um dado (Raio Prismático: d8) ou os PV atuais
   * (Palavra Divina). A linha que cobre o valor troca campos da magia para aquele alvo.
   */
  table?: {
    by: 'die' | 'hp';
    die?: number;
    rows: {
      from: number;
      to: number;
      patch: Partial<
        Pick<
          Spell,
          'damage' | 'extraDamage' | 'condition' | 'effect' | 'kill' | 'manual' | 'manualEn'
        >
      >;
    }[];
  };
  /** Depois do ataque, acerte ou erre: explode no alvo e nas criaturas a até `radius` ft dele (Faca de Gelo). */
  splash?: { radius: number; ability: Ability; onSave: 'half' | 'none'; damage: SpellDamage };
  /** Encerra as magias do alvo (Dissipar Magia): automático até o espaço usado, acima disso teste de atributo. */
  dispel?: boolean;
  /** Escolhas da conjuração (Proteção contra Energia: tipo de dano); `patch` substitui campos da magia. */
  options?: SpellOption[];
  /** Traz de volta quem morreu há pouco, com 1 PV (Reviver). */
  revive?: boolean | 'full';
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
  /** A repetição fica com o alvo, não com o conjurador (Sopro do Dragão). */
  grantSustain?: boolean;
  /** A conjuração em si não causa o efeito: quem o causa é a repetição (`sustain`) ou a área (`zone`). */
  noInitial?: boolean;
  zone?: SpellZone;
  /** Efeito visual no mapa, escrito a partir da descrição desta magia. */
  vfx?: SpellVfx;
  /** Muda a forma de quem usa (ver `FormSpec`). */
  form?: FormSpec;
  /** Gera uma opção de forma por criatura do Bestiário (ver `FormFrom`); preenchido ao carregar. */
  formFrom?: FormFrom;
  /** Alterna entre o plano Material e o Etéreo (Etereidade, Passo Etéreo). */
  plane?: 'toggle';
  /** Cria criaturas no mapa (ver `SummonSpec`). */
  summon?: SummonSpec;
  /** Puramente narrativa: o motor gasta espaço/concentração e registra o texto oficial, nada mais. */
  narrative?: boolean;
  /** Parte do efeito o Mestre resolve (texto dito ao conjurar); o que o motor faz está nos campos acima. */
  manual?: string;
  /** `manual` em inglês. */
  manualEn?: string;
  description: string;
}

/** Mecânica de uma magia em `public/data/spell-rules*.json`; o resto vem do SRD (ver `spells/build`). */
export type SpellRule = Partial<
  Omit<Spell, 'id' | 'name' | 'level' | 'school' | 'description' | 'rounds'>
> & { rounds?: number };
