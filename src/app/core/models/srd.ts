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
  actions: { name: string; desc: string }[];
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
