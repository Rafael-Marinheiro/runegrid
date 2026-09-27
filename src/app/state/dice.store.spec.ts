import { TestBed } from '@angular/core/testing';
import { DiceError } from '@core/rules/dice';
import { DiceStore } from './dice.store';
import { RNG } from './rng.token';

describe('DiceStore', () => {
  let store: DiceStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: RNG, useValue: () => 0.5 }] });
    store = TestBed.inject(DiceStore);
  });

  it('guarda a rolagem mais recente primeiro', () => {
    store.roll('1d6');
    store.roll('1d8+1');
    expect(store.history()).toHaveLength(2);
    expect(store.last()!.result.total).toBe(6); // 1 + floor(0.5 * 8) + 1
  });

  it('registra d20 com vantagem', () => {
    store.rollD20(3, 'advantage');
    expect(store.last()!.d20?.mode).toBe('advantage');
    expect(store.last()!.result.total).toBe(11 + 3);
  });

  it('notação inválida lança e não polui o histórico', () => {
    expect(() => store.roll('xyz')).toThrow(DiceError);
    expect(store.history()).toHaveLength(0);
  });

  it('limita e limpa o histórico', () => {
    for (let i = 0; i < 60; i++) store.roll('1d4');
    expect(store.history()).toHaveLength(50);
    store.clear();
    expect(store.history()).toHaveLength(0);
  });

  it('mantém o som desligado por padrão e limita o volume', () => {
    expect(store.soundOn()).toBe(false);
    expect(store.soundVolume()).toBe(0.55);

    TestBed.flushEffects();
    localStorage.setItem('runegrid.dice-sound.v1', JSON.stringify({ on: true, volume: 9 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: RNG, useValue: () => 0.5 }] });
    store = TestBed.inject(DiceStore);

    expect(store.soundOn()).toBe(true);
    expect(store.soundVolume()).toBe(1);
  });
});
