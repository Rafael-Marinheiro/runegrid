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
  /** Vencedor quando `phase === 'ended'`. */
  outcome?: 'party' | 'foes';
}

export interface LogEntry {
  id: number;
  round: number;
  text: string;
  /** Envolve criatura oculta: só o Mestre vê. */
  secret?: boolean;
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
