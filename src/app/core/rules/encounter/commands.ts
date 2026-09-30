import { ConditionName, Creature, DamageType } from '../../models/creature';
import { MapFloor } from '../../models/encounter';
import {
  GridMap,
  MapBackground,
  MapObject,
  MapVision,
  PlacedItem,
  Portal,
  Pos,
  Room,
  Terrain,
  Texture,
  Trap,
} from '../../models/grid';
import { AdvMode } from '../dice';

/** Tudo que muda o encontro passa por um destes comandos. */
export type Command =
  // Mestre: montagem
  | { type: 'addCreature'; creature: Creature; pos?: Pos; hidden?: boolean }
  | { type: 'removeCreature'; id: string }
  | { type: 'placeToken'; id: string; pos: Pos }
  | { type: 'setHidden'; id: string; hidden: boolean }
  /** Troca a miniatura do token (só o Mestre); `art` ausente remove. */
  | { type: 'setTokenArt'; id: string; art?: string }
  | { type: 'setTerrain'; pos: Pos; terrain: Terrain }
  /** Pintura em lote (um traço do pincel = um comando = um "desfazer"). */
  | { type: 'paint'; cells: Pos[]; terrain: Terrain }
  | { type: 'setFog'; cells: Pos[]; hidden: boolean }
  | { type: 'setMap'; map: GridMap }
  | { type: 'setTexture'; texture: Texture }
  | { type: 'setMapBackground'; background?: MapBackground }
  | { type: 'setVision'; vision: MapVision }
  | { type: 'addFloor'; id: string; name: string; map: GridMap }
  | { type: 'removeFloor'; id: string }
  | { type: 'switchFloor'; id: string }
  | {
      type: 'setFloors';
      floorId: string;
      floorName: string;
      floors: Pick<MapFloor, 'id' | 'name' | 'map'>[];
    }
  | { type: 'upsertPortal'; portal: Portal }
  | { type: 'removePortal'; id: string }
  | { type: 'travelPortal'; id: string }
  | { type: 'upsertRoom'; room: Room }
  | { type: 'removeRoom'; id: string }
  /** Revela (ou oculta) toda a sala e publica o texto de leitura. */
  | { type: 'revealRoom'; id: string; hidden?: boolean }
  | { type: 'upsertTrap'; trap: Trap }
  | { type: 'removeTrap'; id: string }
  | { type: 'upsertItem'; item: PlacedItem }
  | { type: 'removeItem'; id: string }
  | { type: 'upsertMapObject'; object: MapObject }
  | { type: 'removeMapObject'; id: string }
  | { type: 'rollInitiative' }
  | { type: 'setInitiative'; id: string; value: number }
  /** Rolagem do Mestre que os jogadores não veem (só o Mestre pode enviar). */
  | { type: 'secretRoll'; expr: string }
  | { type: 'joinCombat'; id: string }
  | { type: 'startCombat' }
  | { type: 'endCombat' }
  | { type: 'resetCombat' }
  | { type: 'damage'; targetId: string; amount: number; damageType?: DamageType }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'addCondition'; targetId: string; condition: ConditionName; rounds?: number }
  | { type: 'removeCondition'; targetId: string; condition: ConditionName }
  // Ações de turno (jogador dono da criatura ou Mestre)
  | { type: 'move'; actorId: string; to: Pos }
  | {
      type: 'attack';
      actorId: string;
      targetId: string;
      attackIndex: number;
      mode?: AdvMode;
      /** Nocaute (SRD 2024): corpo a corpo que derrubaria o alvo o deixa com 1 PV, inconsciente. */
      knockOut?: boolean;
    }
  | {
      type: 'cast';
      actorId: string;
      spellId: string;
      slotLevel?: number;
      targetId?: string;
      point?: Pos;
    }
  | { type: 'openDoor'; actorId: string; pos: Pos }
  | { type: 'standUp'; actorId: string }
  | { type: 'dash'; actorId: string }
  | { type: 'dodge'; actorId: string }
  | { type: 'disengage'; actorId: string }
  | { type: 'hide'; actorId: string }
  /** Ajudar: o próximo ataque de um aliado contra o inimigo adjacente tem vantagem. */
  | { type: 'help'; actorId: string; targetId: string }
  /** Usa um consumível do próprio inventário (gasta a ação). */
  | { type: 'useItem'; actorId: string; itemId: string }
  | { type: 'deathSave'; actorId: string }
  /** Usa (ou recusa) a reação pendente do personagem: o ataque de oportunidade. */
  | { type: 'reaction'; actorId: string; use: boolean }
  | { type: 'endTurn'; actorId: string };

export type CommandType = Command['type'];

/** Comandos que um jogador pode enviar (sempre por uma criatura sua, na vez dela). */
export const PLAYER_COMMANDS: readonly CommandType[] = [
  'move',
  'standUp',
  'openDoor',
  'cast',
  'attack',
  'dash',
  'dodge',
  'disengage',
  'hide',
  'help',
  'useItem',
  'deathSave',
  'reaction',
  'endTurn',
];
