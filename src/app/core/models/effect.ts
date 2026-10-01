import type { Ability, ConditionName, DamageType } from './creature';

/** Modificadores que um efeito ativo aplica a quem o carrega (ver `rules/creature/effects`). */
export interface EffectMods {
  /** Bônus de CA (Escudo +5, Escudo da Fé +2). */
  ac?: number;
  /** Bônus (ou penalidade) nas jogadas de ataque (Antenas do Monstro da Ferrugem). */
  attackBonus?: number;
  /** Ferrugem do Metal: arma de metal não mágica que acerta a criatura sofre −1 cumulativo no dano. */
  rustMetal?: boolean;
  /** O golpe com este ataque (nome em inglês) corrói a armadura de metal do alvo (Mordida do Monstro da Ferrugem). */
  corrodeOnHit?: string;
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
  /** Fúria: resistência a dano de arma, dano extra corpo a corpo e fim se não atacar nem sofrer dano. */
  rage?: boolean;
  /** Dano fixo somado aos golpes corpo a corpo de arma (Fúria). */
  meleeDamage?: number;
  /** Resistência à Magia: vantagem nas salvaguardas contra magias e outros efeitos mágicos. */
  magicResistance?: boolean;
  /** Táticas de Matilha: vantagem no ataque se um aliado capaz de agir está a até 5 ft do alvo. */
  packTactics?: boolean;
  /** Resistência Lendária: vezes por dia em que uma salvaguarda falha vira sucesso (gasta sozinha). */
  legendaryResistance?: number;
  /** Passagem Rápida: não provoca ataques de oportunidade. */
  noOpportunity?: boolean;
  /** Regeneração: tipos de dano que a suspendem até o início do próximo turno. */
  regenStops?: DamageType[];
  /** Frenesi Sanguinário: vantagem contra criaturas que não estão com todos os PV. */
  bloodFrenzy?: boolean;
  /** Dano devolvido a quem acerta quem carrega (Corpo Aquecido); `melee`: só ataques corpo a corpo. */
  retaliate?: { dice: string; type: DamageType; melee?: boolean };
  /** Fortitude de Morto-vivo: a 0 PV, salvaguarda de Constituição CD 5 + dano; sucesso = 1 PV (exceto radiante/crítico). */
  undeadFortitude?: boolean;
  /** Desvantagem nos ataques à luz do sol (Sensibilidade à Luz Solar, Fraqueza à Luz Solar). */
  sunDisadvantage?: boolean;
  /** Dano no início do turno à luz do sol (Fraqueza do Vampiro: 20 radiante). */
  sunDamage?: { dice: string; type: DamageType };
  /** Dano ao terminar o turno em água corrente (Fraqueza do Vampiro: 20 ácido). */
  waterDamage?: { dice: string; type: DamageType };
  /** A Regeneração não funciona à luz do sol nem em água corrente. */
  regenNeedsShade?: boolean;
  /** Quem este monstro agarra sofre dano no início de cada turno enquanto durar o agarrão (corrente do Diabo de Correntes). */
  grappleDamage?: { dice: string; type: DamageType };
  /** Não ataca enquanto mantém alguém agarrado (corrente animada). */
  grappleLocks?: boolean;
  /** Grita quando uma criatura ou luz chega perto (Fungo Gritador): raio em pés. */
  shriek?: { ft: number; minute?: boolean };
  /** Proibição: não entra numa moradia sem convite. */
  forbiddance?: boolean;
  /** Estaca no Coração: paralisa (`paralyze`) ou destrói (`destroy`) quem está incapacitado. */
  stake?: 'paralyze' | 'destroy';
  /** A 0 PV, em vez de morrer vira névoa (Fuga Nebulosa). */
  mistyEscape?: boolean;
  /** Divide-se em dois ao sofrer dano de raio ou cortante (gosmas, Dividir). */
  split?: boolean;
  /** Dividir do 2024: também divide ao ficar Ferido (PV caem a metade ou menos). */
  splitBloodied?: boolean;
  /** Implacável: uma vez por descanso, dano de até `maxDamage` que o levaria a 0 PV o deixa com 1 PV. */
  relentless?: number;
  /** Vantagem Marcial: uma vez por turno, dano extra se um aliado capaz de agir está a até 5 ft do alvo. */
  allyBonus?: { dice: string };
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
  /** Conjurar de novo soma `ac` e `attackBonus` em vez de substituir (penalidade cumulativa). */
  stack?: boolean;
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
  /** Fúria: já atacou ou sofreu dano neste turno (senão ela acaba no fim do turno). */
  kept?: boolean;
  mods: EffectMods;
}
