import { Creature } from './creature';
import { DiagonalRule, GridMap, Pos } from './grid';

export interface Token {
  creatureId: string;
  /** Célula do canto superior esquerdo. */
  pos: Pos;
  /** Oculto aos jogadores (monstro não revelado). */
  hidden?: boolean;
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
}

/** Uma reação à espera de decisão (por enquanto: ataque de oportunidade). */
export interface PendingReaction {
  id: number;
  kind: 'opportunity';
  reactorId: string;
  targetId: string;
  /** Índice do ataque corpo a corpo do reator. */
  attackIndex: number;
  /** Alcance (ft) do ataque no momento em que o alvo saiu dele. */
  reach: number;
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
  /** Envolve criatura oculta: só o Mestre vê. */
  secret?: boolean;
  /** Dados rolados pelo comando que gerou esta entrada. */
  dice?: RolledDie[];
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
}

/** Quem está enviando o comando. */
export type Role = { kind: 'dm' } | { kind: 'player'; owns: string[] };
