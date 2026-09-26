import { ConditionName, Creature, DamageType } from '../../models/creature';
import { Pos, Terrain } from '../../models/grid';
import { AdvMode } from '../dice';

/** Tudo que muda o encontro passa por um destes comandos. */
export type Command =
  // Mestre: montagem
  | { type: 'addCreature'; creature: Creature; pos?: Pos; hidden?: boolean }
  | { type: 'removeCreature'; id: string }
  | { type: 'placeToken'; id: string; pos: Pos }
  | { type: 'setHidden'; id: string; hidden: boolean }
  | { type: 'setTerrain'; pos: Pos; terrain: Terrain }
  | { type: 'rollInitiative' }
  | { type: 'setInitiative'; id: string; value: number }
  | { type: 'joinCombat'; id: string }
  | { type: 'startCombat' }
  | { type: 'endCombat' }
  | { type: 'damage'; targetId: string; amount: number; damageType?: DamageType }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'addCondition'; targetId: string; condition: ConditionName; rounds?: number }
  | { type: 'removeCondition'; targetId: string; condition: ConditionName }
  // Ações de turno (jogador dono da criatura ou Mestre)
  | { type: 'move'; actorId: string; to: Pos }
  | { type: 'attack'; actorId: string; targetId: string; attackIndex: number; mode?: AdvMode }
  | {
      type: 'cast';
      actorId: string;
      spellId: string;
      slotLevel?: number;
      targetId?: string;
      point?: Pos;
    }
  | { type: 'standUp'; actorId: string }
  | { type: 'dash'; actorId: string }
  | { type: 'dodge'; actorId: string }
  | { type: 'disengage'; actorId: string }
  | { type: 'deathSave'; actorId: string }
  | { type: 'endTurn'; actorId: string };

export type CommandType = Command['type'];

/** Comandos que um jogador pode enviar (sempre por uma criatura sua, na vez dela). */
export const PLAYER_COMMANDS: readonly CommandType[] = [
  'move',
  'standUp',
  'cast',
  'attack',
  'dash',
  'dodge',
  'disengage',
  'deathSave',
  'endTurn',
];
