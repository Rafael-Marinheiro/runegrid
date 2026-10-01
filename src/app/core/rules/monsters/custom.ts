/**
 * Criaturas de blocos de estatística que escalam com o espaço da magia (SRD 5.2: Corcel de Outro
 * Mundo). Não estão na lista de monstros: a ficha é montada na hora (`customCreature`) e as
 * habilidades, a partir do id (`otherworldly-steed-<tipo>-<nível>`), sem precisar de registro.
 */
import { Ability, Creature, DamageType } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { abilityMod, proficiencyBonus } from '../creature/stats';
import { buildMonsterAbilities, MonsterRules } from './build';
import { MonsterEntry } from './registry';

export type SteedKind = 'celestial' | 'fey' | 'fiend';

const KIND: Record<
  SteedKind,
  { pt: string; en: string; damage: DamageType; type: string; typeEn: string }
> = {
  celestial: {
    pt: 'Celestial',
    en: 'Celestial',
    damage: 'radiant',
    type: 'Celestial',
    typeEn: 'Celestial',
  },
  fey: { pt: 'Feérico', en: 'Fey', damage: 'psychic', type: 'Feérico', typeEn: 'Fey' },
  fiend: { pt: 'Corruptor', en: 'Fiend', damage: 'necrotic', type: 'Corruptor', typeEn: 'Fiend' },
};

export const STEED_ID = /^otherworldly-steed-(celestial|fey|fiend)-([2-9])$/;

/** Corcel de Outro Mundo (SRD 5.2): Grande; CA 10 + nível; PV 5 + 10 por nível; velocidade 60 ft. */
export function otherworldlySteed(caster: Creature, level: number, kind: SteedKind): Creature {
  const k = KIND[kind];
  const casting: Ability = caster.spellcasting?.ability ?? 'wis';
  const attack = proficiencyBonus(caster) + abilityMod(caster.abilities[casting]);
  const hp = 5 + 10 * level;
  return newCreature('npc', {
    name: `Corcel de Outro Mundo (${k.pt})`,
    size: 'large',
    speed: 60,
    ac: 10 + level,
    abilities: { str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 },
    saveProficiencies: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    hp: { max: hp, current: hp, temp: 0 },
    attacks: [
      {
        name: 'Otherworldly Slam',
        bonus: attack,
        damage: `1d8+${level}`,
        type: k.damage,
        range: 5,
      },
    ],
    srdId: `srd-2024_otherworldly-steed-${kind}-${level}`,
    // sem nível/ND próprios: usa a proficiência de quem conjurou nas contas de CD
    level: caster.level,
  });
}

const rulesFor = (kind: SteedKind, level: number): MonsterRules => {
  const id = `otherworldly-steed-${kind}-${level}`;
  const base = { cost: 'bonus', uses: { n: 1, per: 'day' } } as const;
  const abilities: MonsterRules[string]['abilities'] = {};
  if (kind === 'celestial')
    abilities['healing-touch'] = {
      pt: 'Toque Curativo',
      en: 'Healing Touch',
      desc: "Healing Touch (Celestial Only; Recharges after a Long Rest). One creature within 5 feet of the steed regains a number of Hit Points equal to 2d8 plus the spell's level.",
      ability: base,
      target: { kind: 'creature' },
      range: 5,
      resolution: { kind: 'auto' },
      heal: { dice: '2d8', flat: level },
      vfx: { kind: 'glow', color: 'life' },
    };
  if (kind === 'fey')
    abilities['fey-step'] = {
      pt: 'Passo Feérico',
      en: 'Fey Step',
      desc: 'Fey Step (Fey Only; Recharges after a Long Rest). The steed teleports, along with its rider, to an unoccupied space of your choice up to 60 feet away from itself.',
      ability: base,
      target: { kind: 'point' },
      range: 60,
      teleport: true,
      manual: 'Quem estiver montado vai junto: o Mestre move o cavaleiro.',
      manualEn: 'Its rider goes along: the DM moves the rider.',
      vfx: { kind: 'glow', color: 'arcane' },
    };
  if (kind === 'fiend')
    abilities['fell-glare'] = {
      pt: 'Olhar Sombrio',
      en: 'Fell Glare',
      desc: 'Fell Glare (Fiend Only; Recharges after a Long Rest). Wisdom Saving Throw: DC equals your spell save DC, one creature within 60 feet the steed can see. Failure: The target has the Frightened condition until the end of your next turn.',
      ability: base,
      target: { kind: 'creature' },
      range: 60,
      resolution: { kind: 'save', ability: 'wis', onSave: 'none' },
      condition: { name: 'frightened', rounds: 1 },
      vfx: { kind: 'ray', color: 'shadow' },
    };
  return { [id]: { abilities } };
};

const cache = new Map<string, MonsterEntry>();

/** Habilidades do corcel pelo id (sem o prefixo do SRD 2024), ou `undefined` se não for um. */
export function customEntry(baseId: string): MonsterEntry | undefined {
  const m = STEED_ID.exec(baseId);
  if (!m) return undefined;
  let e = cache.get(baseId);
  if (!e) {
    e = buildMonsterAbilities('2024', rulesFor(m[1] as SteedKind, Number(m[2]))).get(baseId);
    if (e) cache.set(baseId, e);
  }
  return e;
}

export const steedKinds = KIND;
