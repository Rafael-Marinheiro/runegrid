import { SrdMonster } from '../../models/srd';
import { crLabel, monsterToCreature } from './convert';
import { estimateEncounter, xpForCr } from './xp';

const goblin: SrdMonster = {
  id: 'goblin',
  name: 'Goblin',
  size: 'small',
  type: 'Humanoid',
  cr: 0.25,
  ac: 15,
  hp: 7,
  hitDice: '2d6',
  speed: 30,
  abilities: [8, 14, 10, 10, 8, 8],
  saves: { dex: 4 },
  skills: { stealth: 6, sleight_of_hand: 4 },
  resistances: [],
  immunities: ['poison'],
  vulnerabilities: [],
  notes: '',
  senses: '',
  languages: '',
  attacks: [{ name: 'Cimitarra', bonus: 4, damage: '1d6+2', type: 'slashing', range: 5 }],
  attacksPerAction: 1,
  traits: [],
  actions: [],
};

describe('monsterToCreature', () => {
  it('converte estatísticas, ataques e imunidades', () => {
    const c = monsterToCreature(goblin, 'Goblin 2');
    expect(c).toMatchObject({
      name: 'Goblin 2',
      kind: 'monster',
      cr: 0.25,
      size: 'small',
      ac: 15,
      speed: 30,
    });
    expect(c.abilities).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
    expect(c.hp).toEqual({ max: 7, current: 7, temp: 0 });
    expect(c.attacks[0].damage).toBe('1d6+2');
    expect(c.immunities).toEqual(['poison']);
    expect(c.saveProficiencies).toEqual(['dex']);
  });

  it('mapeia perícias da API (snake_case) e ignora as desconhecidas', () => {
    const c = monsterToCreature({
      ...goblin,
      skills: { stealth: 6, sleight_of_hand: 4, inexistente: 1 },
    });
    expect(Object.keys(c.skills).sort()).toEqual(['sleightOfHand', 'stealth']);
  });

  it('cada conversão gera uma criatura independente', () => {
    const a = monsterToCreature(goblin);
    const b = monsterToCreature(goblin);
    expect(a.id).not.toBe(b.id);
    a.attacks[0].bonus = 99;
    expect(goblin.attacks[0].bonus).toBe(4);
  });

  it('rótulos de ND', () => {
    expect([0.125, 0.25, 0.5, 1, 10].map(crLabel)).toEqual(['1/8', '1/4', '1/2', '1', '10']);
  });
});

describe('dificuldade de encontro (DMG)', () => {
  it('XP por ND', () => {
    expect([0, 0.25, 1, 5, 30].map(xpForCr)).toEqual([10, 50, 200, 1800, 155000]);
  });

  it('limiares somam por personagem', () => {
    const e = estimateEncounter([5, 5, 5, 5], []);
    expect(e.thresholds).toEqual({ easy: 1000, medium: 2000, hard: 3000, deadly: 4400 });
    expect(e.difficulty).toBe('trivial');
  });

  it('multiplica o XP pela quantidade de monstros', () => {
    // 4 PJs nível 5; 2 ogros (ND 2 = 450 cada) → 900 × 1,5 = 1350 → fácil
    const e = estimateEncounter([5, 5, 5, 5], [2, 2]);
    expect(e.baseXp).toBe(900);
    expect(e.adjustedXp).toBe(1350);
    expect(e.difficulty).toBe('easy');
  });

  it('classifica de trivial a mortal', () => {
    const party = [5, 5, 5, 5]; // fácil 1000, médio 2000, difícil 3000, mortal 4400
    const d = (crs: number[]) => estimateEncounter(party, crs).difficulty;
    expect(d([1, 1])).toBe('trivial'); // 400 × 1,5 = 600
    expect(d([2, 2])).toBe('easy'); // 900 × 1,5 = 1350
    expect(d([2, 2, 2])).toBe('medium'); // 1350 × 2 = 2700
    expect(d([4, 4])).toBe('hard'); // 2200 × 1,5 = 3300
    expect(d([5, 5])).toBe('deadly'); // 3600 × 1,5 = 5400
  });

  it('grupo pequeno sobe a faixa do multiplicador; grande desce', () => {
    const small = estimateEncounter([5, 5], [2, 2]); // 900 × 2
    const large = estimateEncounter([5, 5, 5, 5, 5, 5], [2, 2]); // 900 × 1
    expect(small.adjustedXp).toBe(1800);
    expect(large.adjustedXp).toBe(900);
  });
});
