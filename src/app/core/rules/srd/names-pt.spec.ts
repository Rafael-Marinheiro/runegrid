import monsters2014 from '../../../../../public/data/monsters.json';
import monsters2024 from '../../../../../public/data/monsters-2024.json';
import spells2014 from '../../../../../public/data/spells.json';
import spells2024 from '../../../../../public/data/spells-2024.json';
import { monsterNamePt, MONSTER_NAMES_PT, spellNamePt, SPELL_NAMES_PT } from './names-pt';

describe('glossário pt-BR do SRD (F11-6)', () => {
  it('traduz nomes conhecidos', () => {
    expect(monsterNamePt('Goblin')).toBe('Goblin');
    expect(monsterNamePt('Giant Spider')).toBe('Aranha Gigante');
    expect(monsterNamePt('Adult Red Dragon')).toBe('Dragão Vermelho Adulto');
    expect(spellNamePt('Fireball')).toBe('Bola de Fogo');
    expect(spellNamePt('Magic Missile')).toBe('Míssil Mágico');
  });

  it('cai no nome em inglês quando não há tradução', () => {
    expect(monsterNamePt('Something Made Up')).toBe('Something Made Up');
    expect(spellNamePt('Something Made Up')).toBe('Something Made Up');
  });

  it('todo monstro e toda magia importados do SRD (2014 e 2024) têm entrada própria no glossário', () => {
    const monsterNames = new Set(
      [...monsters2014, ...monsters2024].map((m: { name: string }) => m.name),
    );
    const missingMonsters = [...monsterNames].filter((n) => !(n in MONSTER_NAMES_PT));
    expect(missingMonsters).toEqual([]);

    const spellNames = new Set([...spells2014, ...spells2024].map((s: { name: string }) => s.name));
    const missingSpells = [...spellNames].filter((n) => !(n in SPELL_NAMES_PT));
    expect(missingSpells).toEqual([]);
  });

  it('não tem entrada sobrando (todo nome do glossário existe em algum dos dois SRDs)', () => {
    const monsterNames = new Set(
      [...monsters2014, ...monsters2024].map((m: { name: string }) => m.name),
    );
    const extraMonsters = Object.keys(MONSTER_NAMES_PT).filter((n) => !monsterNames.has(n));
    expect(extraMonsters).toEqual([]);

    const spellNames = new Set([...spells2014, ...spells2024].map((s: { name: string }) => s.name));
    const extraSpells = Object.keys(SPELL_NAMES_PT).filter((n) => !spellNames.has(n));
    expect(extraSpells).toEqual([]);
  });
});
