import {
  isTokenArt,
  MiniatureEntry,
  pickMiniature,
  queryFromCreature,
  queryFromMonster,
  suggestMiniatures,
} from './miniature';

const e = (raca: MiniatureEntry['raca'], arquivo: string, nome = arquivo): MiniatureEntry => ({
  arquivo: `miniaturas/${arquivo}.png`,
  nome,
  raca,
  grupo: 'g',
});

const catalog = [
  e('humano', 'humano_guarda_espada-escudo', 'guarda espada escudo'),
  e('humano', 'humano_guarda_besta-couro', 'guarda besta couro'),
  e('humano', 'humano_mago_cajado-orbe', 'mago cajado orbe'),
  e('humano', 'humano_plebeu_roupa-simples', 'plebeu roupa simples'),
  e('goblin', 'goblin_xama-caveira-cajado', 'Xamã — caveira e cajado'),
  e('goblin', 'goblin_arqueiro-arco-curto-capuz', 'Arqueiro — arco curto'),
  e('goblin', 'goblin_ladino-duas-adagas', 'Ladino — duas adagas'),
  e('elfo', 'drow-guerreiro-besta-adaga-01', 'Drow — guerreiro'),
  e('elfo', 'elfos-altos-mago-01', 'Elfos Altos — mago'),
];

describe('miniaturas', () => {
  it('papel e arma decidem entre variantes da mesma raça', () => {
    const guard = { name: 'Guard', kind: 'npc' as const, attacks: [{ name: 'Crossbow' }] };
    expect(suggestMiniatures(queryFromCreature(guard), catalog)[0].arquivo).toContain(
      'guarda_besta',
    );
    const spear = { ...guard, attacks: [{ name: 'Spear' }] };
    expect(suggestMiniatures(queryFromCreature(spear), catalog)[0].arquivo).toContain('guarda');
  });

  it('a raça pelo nome restringe o catálogo; acentos e PT funcionam', () => {
    const q = queryFromCreature({ name: 'Goblin Xamã', kind: 'monster', attacks: [] });
    expect(suggestMiniatures(q, catalog).every((m) => m.raca === 'goblin')).toBe(true);
    expect(suggestMiniatures(q, catalog)[0].arquivo).toContain('xama');
    expect(
      suggestMiniatures(
        queryFromCreature({ name: 'Drow', kind: 'monster', attacks: [] }),
        catalog,
      )[0].raca,
    ).toBe('elfo');
  });

  it('monstro não humanoide sem raça não tem sugestão; humanoide vira humano', () => {
    expect(
      suggestMiniatures(queryFromMonster({ name: 'Ogre', type: 'Giant', attacks: [] }), catalog),
    ).toEqual([]);
    const mage = queryFromMonster({ name: 'Mage', type: 'Humanoid', attacks: [] });
    expect(suggestMiniatures(mage, catalog)[0].arquivo).toContain('mago');
  });

  it('pickMiniature reveza entre empates, e cai no fallback sem correspondência', () => {
    const q = queryFromMonster({
      name: 'Goblin',
      type: 'Humanoid',
      attacks: [{ name: 'Scimitar' }],
    });
    // só a raça casa → fallback do SRD
    expect(pickMiniature(q, catalog, 'miniaturas/x.png')).toBe('miniaturas/x.png');
    const bow = queryFromMonster({
      name: 'Goblin Archer',
      type: 'Humanoid',
      attacks: [{ name: 'Shortbow' }],
    });
    expect(pickMiniature(bow, catalog)).toContain('arqueiro');
    expect(pickMiniature({ ...q, race: null }, catalog)).toBeUndefined();
    const guard = queryFromMonster({
      name: 'Guard',
      type: 'Humanoid',
      attacks: [{ name: 'Sword' }],
    });
    const a = pickMiniature(guard, catalog, undefined, 0);
    expect(pickMiniature(guard, catalog, undefined, 0)).toBe(a); // determinístico
  });

  it('monstro só vira humano se o nome tem papel humano (guarda sim, ogro/guardião não)', () => {
    const q = (name: string) => queryFromCreature({ name, kind: 'monster', attacks: [] }).race;
    expect(q('Guarda')).toBe('humano');
    expect(q('Mage')).toBe('humano');
    expect(q('Ogre')).toBeNull();
    expect(q('Shield Guardian')).toBeNull();
  });

  it('hobgoblin não cai na raça goblin (e vice-versa)', () => {
    const cat = [
      e('goblin', 'goblin_guerreiro'),
      e('hobgoblin', 'hobgoblin_01_guerreiro', 'Guerreiro'),
    ];
    const hob = queryFromCreature({ name: 'Hobgoblin Warrior', kind: 'monster', attacks: [] });
    expect(hob.race).toBe('hobgoblin');
    expect(suggestMiniatures(hob, cat).map((x) => x.raca)).toEqual(['hobgoblin']);
    expect(queryFromCreature({ name: 'Goblin', kind: 'monster', attacks: [] }).race).toBe('goblin');
  });

  it('isTokenArt só aceita PNG em miniaturas/ (sem ../ nem URL externa)', () => {
    expect(isTokenArt('miniaturas/goblin_a-b.png')).toBe(true);
    for (const bad of [
      '../x.png',
      'miniaturas/../x.png',
      'https://a/b.png',
      'miniaturas/a/b.png',
      'miniaturas/a.svg',
      3,
    ])
      expect(isTokenArt(bad)).toBe(false);
  });
});
