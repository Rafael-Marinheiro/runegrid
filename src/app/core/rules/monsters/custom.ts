/**
 * Criaturas de blocos de estatística que escalam com o espaço da magia (SRD 5.2: Corcel de Outro
 * Mundo; Espírito Dracônico). Não estão na lista de monstros: a ficha é montada na hora (`customCreature`) e as
 * habilidades, a partir do id (`otherworldly-steed-<tipo>-<nível>`), sem precisar de registro.
 */
import { Ability, Creature, DAMAGE_TYPES, DamageType } from '../../models/creature';
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

export type DragonType = 'acid' | 'cold' | 'fire' | 'lightning' | 'poison';
export const DRAGON_ID = /^draconic-spirit-(acid|cold|fire|lightning|poison)-([5-9])$/;
export const STEED_ID = /^otherworldly-steed-(celestial|fey|fiend)-([2-9])$/;

/** Corcel de Outro Mundo (SRD 5.2): Grande; CA 10 + nível; PV 5 + 10 por nível; velocidade 60 ft. */
export function otherworldlySteed(
  caster: Creature,
  level: number,
  kind: SteedKind,
  en = true,
): Creature {
  const k = KIND[kind];
  const casting: Ability = caster.spellcasting?.ability ?? 'wis';
  const attack = proficiencyBonus(caster) + abilityMod(caster.abilities[casting]);
  const hp = 5 + 10 * level;
  return newCreature('npc', {
    name: en ? `Otherworldly Steed (${k.en})` : `Corcel de Outro Mundo (${k.pt})`,
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

const DRAGON_VFX: Record<DragonType, 'acid' | 'frost' | 'fire' | 'lightning' | 'poison'> = {
  acid: 'acid',
  cold: 'frost',
  fire: 'fire',
  lightning: 'lightning',
  poison: 'poison',
};

/** Espírito Dracônico (SRD 5.2): Grande; CA 14 + nível; PV 50 + 10 por nível acima de 5; Rend metade do nível vezes. */
export function draconicSpirit(
  caster: Creature,
  level: number,
  type: DragonType,
  en = true,
): Creature {
  const casting: Ability = caster.spellcasting?.ability ?? 'wis';
  const attack = proficiencyBonus(caster) + abilityMod(caster.abilities[casting]);
  const hp = 50 + 10 * Math.max(0, level - 5);
  return newCreature('npc', {
    name: en ? `Draconic Spirit (${DRAGON_EN[type]})` : `Espírito Dracônico (${DRAGON_PT[type]})`,
    size: 'large',
    speed: 30,
    darkvision: 60,
    ac: 14 + level,
    abilities: { str: 19, dex: 14, con: 17, int: 10, wis: 14, cha: 14 },
    hp: { max: hp, current: hp, temp: 0 },
    resistances: ['acid', 'cold', 'fire', 'lightning', 'poison'],
    attacks: [
      { name: 'Rend', bonus: attack, damage: `1d6+${4 + level}`, type: 'piercing', range: 10 },
    ],
    attacksPerAction: Math.max(1, Math.floor(level / 2)),
    srdId: `srd-2024_draconic-spirit-${type}-${level}`,
    level: caster.level,
  });
}

const DRAGON_EN: Record<DragonType, string> = {
  acid: 'Acid',
  cold: 'Cold',
  fire: 'Fire',
  lightning: 'Lightning',
  poison: 'Poison',
};

const DRAGON_PT: Record<DragonType, string> = {
  acid: 'Ácido',
  cold: 'Gélido',
  fire: 'Fogo',
  lightning: 'Elétrico',
  poison: 'Veneno',
};

const dragonRules = (type: DragonType, level: number): MonsterRules => ({
  [`draconic-spirit-${type}-${level}`]: {
    abilities: {
      'breath-weapon': {
        pt: 'Sopro',
        en: 'Breath Weapon',
        desc: 'Breath Weapon. Dexterity Saving Throw: DC equals your spell save DC, each creature in a 30-foot Cone. Failure: 2d6 damage of a type this spirit has Resistance to (your choice when you cast the spell). Success: Half damage.',
        ability: { cost: 'free' },
        target: { kind: 'cone', length: 30 },
        range: 0,
        resolution: { kind: 'save', ability: 'dex', onSave: 'half' },
        damage: { dice: '2d6', type },
        manual: 'Faz parte do Multiataque: use uma vez por turno, junto com os Rend.',
        manualEn: 'Part of its Multiattack: use it once per turn, together with the Rend attacks.',
        vfx: { kind: 'cone', color: DRAGON_VFX[type] },
      },
    },
  },
});

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
  if (baseId === 'animated-chain') {
    let c = cache.get(baseId);
    if (!c) {
      c = buildMonsterAbilities('2014', chainRules()).get(baseId);
      if (c) cache.set(baseId, c);
    }
    return c;
  }
  const steed = STEED_ID.exec(baseId);
  const dragon = DRAGON_ID.exec(baseId);
  if (!steed && !dragon) return undefined;
  let e = cache.get(baseId);
  if (!e) {
    const rules = steed
      ? rulesFor(steed[1] as SteedKind, Number(steed[2]))
      : dragonRules(dragon![1] as DragonType, Number(dragon![2]));
    e = buildMonsterAbilities('2024', rules).get(baseId);
    if (e) cache.set(baseId, e);
  }
  return e;
}

export const steedKinds = KIND;

/**
 * Cão Fiel: um cão fantasma invisível para todos menos para quem o conjurou (o token fica oculto) e
 * que não pode ser ferido. Quem o conjura o vê como um token de runa com um cão desenhado.
 */
export function faithfulHound(caster: Creature, ruleset: '2014' | '2024', en = true): Creature {
  return newCreature('npc', {
    name: en ? 'Faithful Hound' : 'Cão Fiel',
    icon: 'hound',
    size: 'medium',
    // 2014: fica onde foi conjurado; 2024: você o move com a ação Magia (o Mestre confere)
    speed: ruleset === '2024' ? 30 : 0,
    ac: 10,
    abilities: { str: 10, dex: 10, con: 10, int: 3, wis: 12, cha: 6 },
    hp: { max: 1, current: 1, temp: 0 },
    immunities: [...DAMAGE_TYPES],
    level: caster.level,
  });
}

/** Corrente animada do Diabo de Correntes (SRD 2014): um objeto com CA 20 e 20 PV que ataca com alcance de 3 m. */
export function animatedChain(en = true): Creature {
  return newCreature('monster', {
    name: en ? 'Animated Chain' : 'Corrente Animada',
    icon: 'chain',
    size: 'small',
    speed: 0,
    ac: 20,
    abilities: { str: 18, dex: 10, con: 10, int: 1, wis: 1, cha: 1 },
    hp: { max: 20, current: 20, temp: 0 },
    resistances: ['piercing'],
    immunities: ['psychic', 'thunder'],
    attacks: [{ name: 'Chain', bonus: 8, damage: '2d6+4', type: 'slashing', range: 10 }],
    srdId: 'animated-chain',
  });
}

const chainRules = (): MonsterRules => ({
  'animated-chain': {
    abilities: {
      'rider-chain': {
        pt: 'Corrente',
        en: 'Chain',
        desc: "Melee Weapon Attack: +8 to hit, reach 10 ft., one target. Hit: 11 (2d6 + 4) slashing damage. The target is grappled (escape DC 14) if the devil isn't already grappling a creature. Until this grapple ends, the target is restrained and takes 7 (2d6) piercing damage at the start of each of its turns.",
        ability: { cost: 'free', rider: 'Chain', dc: 14 },
        condition: [
          { name: 'grappled', rounds: 0 },
          { name: 'restrained', rounds: 0 },
        ],
        manual:
          'Agarrado: escapa com Força (Atletismo) ou Destreza (Acrobacia) CD 14; no início de cada turno do agarrado, 2d6 perfurante (o Mestre aplica). Uma corrente que agarra não ataca.',
        manualEn:
          'Grappled: escapes with Strength (Athletics) or Dexterity (Acrobatics) DC 14; at the start of each of its turns the target takes 2d6 piercing (the DM applies it). A grappling chain cannot attack.',
        target: { kind: 'creature' },
      },
    },
  },
});
