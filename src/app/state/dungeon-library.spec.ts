import { TestBed } from '@angular/core/testing';
import { blankMap } from '@core/models/grid';
import { DungeonLibrary } from './dungeon-library';

const lib = () => {
  localStorage.clear();
  TestBed.resetTestingModule();
  return TestBed.inject(DungeonLibrary);
};

describe('DungeonLibrary', () => {
  it('salva, atualiza pelo nome e remove', () => {
    const l = lib();
    l.save('Cripta', blankMap(6, 5));
    l.save('Cripta', blankMap(8, 5));
    expect(l.items()).toHaveLength(1);
    expect(l.items()[0].map.width).toBe(8);
    l.remove(l.items()[0].id);
    expect(l.items()).toEqual([]);
  });

  it('exporta e importa o mesmo mapa', () => {
    const l = lib();
    const map = blankMap(7, 6);
    const floors = [{ id: 'cellar', name: 'Porão', map: blankMap(5, 4) }];
    const back = l.parse(
      l.serialize({
        name: 'Ida e volta',
        map,
        floorId: 'ground',
        floorName: 'Térreo',
        floors,
      }),
    );
    expect(back?.name).toBe('Ida e volta');
    expect(back?.map).toEqual(map);
    expect(back?.floors).toEqual(floors);
  });

  it('recusa arquivos que não são mapas', () => {
    const l = lib();
    expect(l.parse('não é json')).toBeNull();
    expect(l.parse('{"map":{"width":3,"height":3,"cells":[]}}')).toBeNull();
    expect(l.parse('{"width":2,"height":2,"cells":["floor","wall"]}')).toBeNull();
    expect(
      l.parse(
        '{"map":{"width":3,"height":3,"cells":["floor","floor","floor","floor","floor","floor","floor","floor","floor"]},"floors":[{"id":"x"}]}',
      ),
    ).toBeNull();
  });

  it('blankMap tem borda de parede e respeita os limites', () => {
    const m = blankMap(5, 4);
    expect(m.cells[0]).toBe('wall');
    expect(m.cells[1 * 5 + 1]).toBe('floor');
    expect(blankMap(1, 1).width).toBe(3);
    expect(blankMap(500, 500).width).toBe(60);
  });
});
