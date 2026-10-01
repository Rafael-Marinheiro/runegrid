import type { Ability, ConditionName, DamageType } from './creature';

/** Modificadores que um efeito ativo aplica a quem o carrega (ver `rules/creature/effects`). */
export interface EffectMods {
  /** Bônus de CA (Escudo +5, Escudo da Fé +2). */
  ac?: number;
  /** CA mínima (Pele de Árvore: a CA não pode ser menor que 16). */
  acMin?: number;
  /** Base de CA sem armadura (Armadura Arcana: 13 + Des); só vale se maior que a CA atual. */
  acBase?: number;
  /** Soma o modificador de Destreza à `acBase`. */
  acBaseDex?: boolean;
  /** Dado somado (ou, com `-`, subtraído) de cada jogada de ataque: Bênção `1d4`, Perdição `-1d4`. */
  attackDie?: string;
  /** Idem para salvaguardas. */
  saveDie?: string;
  /** Bônus fixo em salvaguardas (Vínculo Protetor). */
  save?: number;
  /** Vantagem/desvantagem nos ataques de quem carrega o efeito. */
  attackMode?: 'advantage' | 'disadvantage';
  /** Vantagem/desvantagem nos ataques feitos contra quem carrega o efeito (Desfocar, Fogo das Fadas). */
  attackedMode?: 'advantage' | 'disadvantage';
  /** Vantagem/desvantagem nas salvaguardas (de certos atributos, ou todas se vazio). */
  saveMode?: { mode: 'advantage' | 'disadvantage'; abilities?: Ability[] };
  /** Soma ao deslocamento (pés), ou multiplica (`speedMult`); `speedSet` fixa (0 = imóvel). */
  speed?: number;
  speedMult?: number;
  speedSet?: number;
  resist?: DamageType[];
  immune?: DamageType[];
  vulnerable?: DamageType[];
  /** Condições que não pegam (Heroísmo: amedrontado). */
  immuneConditions?: ConditionName[];
  /** Dano extra a cada arma que acerta (Favor Divino, Marca do Caçador, Golpe Marcante). */
  weaponDamage?: { dice: string; type: DamageType | 'weapon'; onlyAgainst?: string };
  /** Bônus nas jogadas de ataque e dano de arma (Arma Mágica). */
  weaponBonus?: number;
  /** No início do turno de quem carrega: recupera PV (Regeneração) ou ganha PV temporários (Heroísmo). */
  regen?: number;
  tempPerTurn?: number;
  /** `tempPerTurn` = modificador do atributo de conjuração de quem conjurou (Heroísmo). */
  tempPerTurnMod?: boolean;
  /** Ações que quem carrega pode fazer como ação bônus (Retirada Acelerada: Correr). */
  bonusActions?: ('dash' | 'disengage' | 'hide')[];
  /** No início do turno de quem carrega: sofre dano (sem salvaguarda). */
  dotStart?: { dice: string; type: DamageType };
  /** No fim do turno de quem carrega: sofre dano (Flecha Ácida). */
  dotEnd?: { dice: string; type: DamageType };
  /** Proteção contra a morte: a primeira vez que cairia a 0 PV fica com 1 PV e o efeito acaba (Proteção contra a Morte). */
  deathWard?: boolean;
  /** Quem carrega não pode reagir (Toque Chocante). */
  noReactions?: boolean;
  /** Quem carrega não recupera PV (Toque Gélido). */
  noHealing?: boolean;
  /** Metade do dano de ataques de Força (Raio do Enfraquecimento). */
  halfWeaponDamage?: boolean;
  /** PV máximos e atuais aumentam enquanto durar (Ajuda); ao acabar, voltam ao que eram. */
  maxHp?: number;
  /** Teste de resistência repetido no fim de cada turno encerra o efeito. */
  repeatSave?: { ability: Ability; dc: number };
  /** Some ao ser usado uma vez (Orientação, Resistência, Verdadeiro Golpe). */
  once?: boolean;
  /** Ao acertar com arma (junto com `weaponDamage` + `once`): consequências no alvo (Golpe Aprisionador, Golpe Ardente). */
  onHit?: {
    /** Salvaguarda do alvo contra a CD da magia; passar evita `condition` e `mods`. */
    save?: Ability;
    /** CD fixada ao conjurar. */
    dc?: number;
    condition?: { name: ConditionName; rounds: number };
    /** Efeito aplicado ao alvo que falha (dano no início do turno, salvaguarda repetida). */
    mods?: EffectMods;
    rounds?: number;
    /** Se o alvo passar na salvaguarda, a magia acaba (perde a concentração). */
    endsOnSave?: boolean;
  };
  /** Imagens ilusórias restantes (Imagem Espelhada): ataques podem mirar uma delas. */
  images?: number;
  /** Imagem Espelhada 2024: ao ser acertado, um d6 por imagem; 3+ desvia o golpe para uma imagem. */
  imagesD6?: boolean;
  /** Dado somado (ou subtraído, com `-`) a cada dano de quem carrega (Raio do Enfraquecimento, 2024). */
  damageDie?: string;
  /** Termina quando quem carrega ataca ou conjura (Invisibilidade, Santuário). */
  endsOnAttack?: boolean;
  /** Sem efeito no motor: só lembrete para o Mestre (testes de atributo, sentidos…). */
  note?: string;
  /** `note` em inglês. */
  noteEn?: string;
}

/** Efeito ativo numa criatura, vindo de uma magia. */
export interface ActiveEffect {
  /** `${quem conjurou}:${magia}`; conjurar de novo no mesmo alvo substitui. */
  id: string;
  /** Id da magia de origem. */
  spell: string;
  name: string;
  /** Quem conjurou. */
  by: string;
  /** Rodadas restantes; sem valor = até ser encerrado (concentração, dissipar, descanso). */
  rounds?: number;
  /**
   * Quando acaba: no fim (padrão) ou início do turno de quem carrega, ou no início/fim do próximo
   * turno de quem conjurou ("até o início do seu próximo turno").
   */
  ends?: 'start' | 'end' | 'casterStart' | 'casterEnd';
  /** Some quando o conjurador perde a concentração. */
  concentration?: boolean;
  /** Some quando quem carrega sofre dano (Padrão Hipnótico). */
  endsOnDamage?: boolean;
  mods: EffectMods;
}
