import { TestBed } from '@angular/core/testing';
import { DiceError } from '@core/rules/dice';
import { MacroStore } from './macros.store';

describe('MacroStore', () => {
  it('salva, substitui pelo nome, remove e recusa expressão inválida', () => {
    localStorage.clear();
    const s = TestBed.inject(MacroStore);
    s.save('Golpe', '1d8+2');
    s.save('Golpe', '2d8+2');
    expect(s.macros().filter((m) => m.name === 'Golpe')).toEqual([
      { name: 'Golpe', expr: '2d8+2' },
    ]);
    expect(() => s.save('Ruim', 'abc')).toThrow(DiceError);
    s.remove('Golpe');
    expect(s.macros().some((m) => m.name === 'Golpe')).toBe(false);
  });
});
