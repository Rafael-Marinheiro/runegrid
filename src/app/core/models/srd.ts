import { Ability, Attack, DamageType, Size } from './creature';

/** Monstro do SRD 5.1 (gerado por `scripts/import-srd.mjs`). */
export interface SrdMonster {
  id: string;
  name: string;
  size: Size;
  type: string;
  cr: number;
  ac: number;
  hp: number;
  hitDice: string;
  speed: number;
  /** Todas as velocidades (a de `speed` é a de caminhada): voo, natação, escalada, escavar. */
  speeds?: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
    hover?: number;
  };
  /** For, Des, Con, Int, Sab, Car. */
  abilities: [number, number, number, number, number, number];
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  resistances: DamageType[];
  immunities: DamageType[];
  vulnerabilities: DamageType[];
  /** Resistências/imunidades em texto (inclui as de armas não mágicas). */
  notes: string;
  senses: string;
  languages: string;
  attacks: Attack[];
  attacksPerAction: number;
  traits: { name: string; desc: string }[];
  /** SRD 5.2: `type` distingue ação bônus, reação e ação lendária; `uses` traz recarga e usos por dia. */
  actions: {
    name: string;
    desc: string;
    type?: 'bonus' | 'reaction' | 'legendary';
    cost?: number;
    uses?: { type: 'recharge' | 'rest' | 'day'; n?: number };
  }[];
  /** SRD 5.1: reações (as do 5.2 vêm em `actions` com `type: 'reaction'`). */
  reactions?: { name: string; desc: string }[];
  /** SRD 5.1: ações lendárias (`count` por rodada) e a regra geral delas. */
  legendary?: {
    desc: string;
    count: number;
    actions: { name: string; desc: string; cost: number }[];
  };
  /** SRD 5.1: magias do bloco de conjuração (nomes em inglês). */
  spells?: string[];
}

export interface SrdSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  desc: string;
  higher?: string;
}
