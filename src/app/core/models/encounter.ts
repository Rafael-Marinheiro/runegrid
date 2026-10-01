import { Fx, FxColor } from './fx';
import { SpellTarget } from './spell';
import { Creature } from './creature';
import { EffectMods } from './effect';
import { DiagonalRule, GridMap, Pos } from './grid';

export interface Token {
  creatureId: string;
  /** Célula do canto superior esquerdo. */
  pos: Pos;
  /** Oculto aos jogadores (monstro não revelado). */
  hidden?: boolean;
}

export interface MapFloor {
  id: string;
  name: string;
  map: GridMap;
  tokens: Token[];
}

export interface TurnState {
  actorId: string;
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  movedFt: number;
  dashed: boolean;
  disengaged: boolean;
  /** Ataques que ainda restam da ação Atacar já iniciada (Ataque Extra). */
  attacksLeft: number;
  /** Surto de Ação já usado neste turno. */
  surged?: boolean;
}

/** Uma reação à espera de decisão: ataque de oportunidade ou magia de reação (ver `encounter/reactions`). */
export interface PendingReaction {
  id: number;
  kind: 'opportunity' | 'spell';
  reactorId: string;
  /** Ataque de oportunidade: quem saiu do alcance. Magia: quem provocou a reação. */
  targetId: string;
  /** Índice do ataque corpo a corpo do reator. */
  attackIndex: number;
  /** Alcance (ft) do ataque no momento em que o alvo saiu dele. */
  reach: number;
  /** Magia de reação: o gatilho e o que fica suspenso até a decisão. */
  spell?: PendingSpellReaction;
}

/** Golpe que acertou e aguarda a decisão de quem pode reagir (o dano só é aplicado depois). */
export interface HeldHit {
  attackerId: string;
  targetId: string;
  /** Linha do registro com a jogada (sem o desfecho). */
  head: string;
  /** Nome do ataque (para a ferrugem). */
  weapon?: string;
  /** Jogada total e CA contra a qual ela acertou (já com cobertura e bônus). */
  total: number;
  ac: number;
  nat20: boolean;
  crit: boolean;
  /** Dano já rolado (dobrado se crítico), por tipo, antes de resistências. */
  parts: { amount: number; type: string }[];
  knockOut?: boolean;
  /** Golpe corpo a corpo (Corpo Aquecido só reage a ele). */
  melee?: boolean;
  /** Consequências no alvo dos golpes marcados (Golpe Aprisionador): de quem, salvaguarda e CD. */
  onHit?: {
    spell: string;
    by: string;
    concentration?: boolean;
    spec: NonNullable<EffectMods['onHit']>;
  }[];
  /** Ataque de magia: consequências além do dano (condições, efeitos) aplicadas ao acertar. */
  rider?: {
    spellId: string;
    slot: number;
    dc: number;
    ability: string;
    ruleset?: '2014' | '2024';
    point?: Pos;
  };
}

/** Gatilho de uma magia de reação e o que fica suspenso até a decisão. */
export type PendingSpellReaction =
  /** Um ataque acertou o reator (Escudo Arcano): o dano só é aplicado depois da decisão. */
  | { trigger: 'hit'; hit: HeldHit }
  /** O reator sofreu dano de `attackerId` (Repreensão Diabólica): já aplicado, a magia responde. */
  | { trigger: 'damaged'; attackerId: string }
  /** Alguém terminou o movimento à vista do reator (Perseguição). */
  | { trigger: 'moved'; moverId: string }
  /** Alguém termina o turno perto do reator (Tinta do Polvo 2024). */
  | { trigger: 'turnEnd'; moverId: string }
  /** Alguém começa o turno perto do reator (Olhar Inquietante). */
  | { trigger: 'turnStart'; moverId: string }
  /** Alguém conjura uma magia (Contrafeitiço): a conjuração inteira aguarda. */
  | { trigger: 'cast'; casterId: string; spellId: string; slotLevel: number; command: string };

/** Área de magia que permanece no mapa (Teia, Névoa Mortal, Guardiões Espirituais). */
export interface Zone {
  id: number;
  spellId: string;
  name: string;
  casterId: string;
  slotLevel: number;
  ruleset?: '2014' | '2024';
  shape: SpellTarget;
  /** Centro (esfera/cubo) ou origem (linha/cone); a aura acompanha o conjurador. */
  center: Pos;
  toward?: Pos;
  aura?: boolean;
  on: 'start' | 'enter' | 'both' | 'cast';
  rounds?: number;
  concentration?: boolean;
  difficult?: boolean;
  obscures?: boolean;
  color?: FxColor;
}

export type CombatPhase = 'setup' | 'running' | 'ended';

export interface Combat {
  phase: CombatPhase;
  round: number;
  /** Ids na ordem de iniciativa. */
  order: string[];
  turnIndex: number;
  initiative: Record<string, number>;
  turn: TurnState | null;
  /** Quem está em Esquiva (vale até o início do próprio turno). */
  dodging: string[];
  /** Ajuda ativa: o próximo ataque contra `targetId` tem vantagem; vale até o início do turno de `by`. */
  helped?: { targetId: string; by: string }[];
  /** Reações à espera de decisão; bloqueiam o fim do turno de quem se moveu. */
  pending?: PendingReaction[];
  /** Quem já usou a reação nesta rodada (volta ao começo do turno de cada um). */
  reactionUsed?: string[];
  /** Criatura cujo fim de turno já foi oferecido às reações (Tinta do Polvo): não oferece de novo. */
  endOffered?: string;
  /** Quem já aplicou o Ataque Furtivo neste turno (limpo a cada novo turno). */
  sneakUsed?: string[];
  /** Vencedor quando `phase === 'ended'`. */
  outcome?: 'party' | 'foes';
}

/** Um dado rolado durante o comando (para animar nas telas de todos). */
export interface RolledDie {
  sides: number;
  value: number;
  dropped: boolean;
}

export interface LogEntry {
  id: number;
  round: number;
  text: string;
  /** Versão em inglês, quando a mensagem tem tradução (sem ela, vale `text`). */
  en?: string;
  /** Envolve criatura oculta: só o Mestre vê. */
  secret?: boolean;
  /** Dados rolados pelo comando que gerou esta entrada. */
  dice?: RolledDie[];
  /** Efeitos visuais da ação (ver `models/fx`). */
  fx?: Fx[];
}

export interface EncounterState {
  name: string;
  map: GridMap;
  rule: DiagonalRule;
  creatures: Creature[];
  tokens: Token[];
  combat: Combat;
  log: LogEntry[];
  /** Número do próximo evento de log. */
  seq: number;
  /** Áreas de magia ativas. */
  zones?: Zone[];
  /** O mapa ativo continua em `map`; os demais ficam guardados aqui. */
  floorId?: string;
  floorName?: string;
  floors?: MapFloor[];
}

/** Quem está enviando o comando. */
export type Role = { kind: 'dm' } | { kind: 'player'; owns: string[] };
