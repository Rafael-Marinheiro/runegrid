import { TestBed } from '@angular/core/testing';
import { PartyStore } from './party.store';
import { RNG } from './rng.token';

const setup = (rng: () => number = () => 0.5) => {
  TestBed.configureTestingModule({ providers: [{ provide: RNG, useValue: rng }] });
  return TestBed.inject(PartyStore);
};

describe('PartyStore', () => {
  beforeEach(() => localStorage.clear());

  it('começa com o grupo de exemplo e seleciona o primeiro', () => {
    const s = setup();
    expect(s.creatures().length).toBeGreaterThan(3);
    expect(s.selected()?.name).toBe('Thordak');
  });

  it('adiciona, duplica e remove', () => {
    const s = setup();
    const n = s.creatures().length;
    s.add('monster');
    expect(s.creatures()).toHaveLength(n + 1);
    expect(s.selected()?.kind).toBe('monster');

    const id = s.selectedId()!;
    s.duplicate(id);
    expect(s.creatures()).toHaveLength(n + 2);
    expect(s.selected()?.name).toContain('(cópia)');
    expect(s.selectedId()).not.toBe(id);

    s.remove(s.selectedId()!);
    expect(s.creatures()).toHaveLength(n + 1);
  });

  it('dano e cura passam pelas regras e geram mensagem', () => {
    const s = setup();
    const id = s.selectedId()!; // Thordak 38/52
    s.damage(id, 10);
    expect(s.selected()!.hp.current).toBe(28);
    expect(s.message()).toContain('sofreu 10 de dano');
    s.heal(id, 100);
    expect(s.selected()!.hp.current).toBe(52);
  });

  it('erro de regra vira mensagem e não altera a ficha', () => {
    const s = setup();
    const lyra = s.creatures().find((c) => c.name.startsWith('Lyra'))!.id;
    s.toggleSlot(lyra, 9, true); // sem espaço de 9º nível
    expect(s.message()).toContain('Sem espaço');
    s.select(lyra);
    expect(s.selected()!.spellSlots[9]).toBeUndefined();
  });

  it('salvaguarda contra a morte usa o RNG injetado', () => {
    const s = setup(() => (20 - 1 + 0.5) / 20); // sempre 20
    const id = s.selectedId()!;
    s.damage(id, 40); // 38 PV: cai a 0 sem morte instantânea
    const r = s.deathSave(id);
    expect(r?.outcome).toBe('revived');
    expect(s.selected()!.hp.current).toBe(1);
  });

  it('persiste no localStorage e recarrega', () => {
    const s = setup();
    s.patch(s.selectedId()!, { name: 'Persistido' });
    TestBed.tick();
    expect(localStorage.getItem('runegrid.creatures.v2')).toContain('Persistido');

    TestBed.resetTestingModule();
    expect(setup().creatures()[0].name).toBe('Persistido');
  });

  it('dado corrompido no armazenamento cai no exemplo', () => {
    localStorage.setItem('runegrid.creatures.v2', '{"quebrado"');
    expect(setup().creatures().length).toBeGreaterThan(3);
  });
});
