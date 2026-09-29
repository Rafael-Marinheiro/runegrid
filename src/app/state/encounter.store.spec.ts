import { TestBed } from '@angular/core/testing';
import { EncounterStore, parseSession, serializeSession } from './encounter.store';
import { RNG } from './rng.token';

const setup = (rng: () => number = () => 0.5) => {
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [{ provide: RNG, useValue: rng }] });
  return TestBed.inject(EncounterStore);
};

describe('EncounterStore', () => {
  it('começa numa montagem de exemplo com criaturas no mapa', () => {
    const s = setup();
    expect(s.state().combat.phase).toBe('setup');
    expect(s.state().tokens.length).toBeGreaterThanOrEqual(5);
  });

  it('comando aceito muda o estado; recusado vira mensagem', () => {
    const s = setup();
    expect(s.send({ type: 'rollInitiative' })).toBe(true);
    expect(Object.keys(s.state().combat.initiative).length).toBeGreaterThan(0);
    expect(s.send({ type: 'endTurn', actorId: s.state().creatures[0].id })).toBe(false);
    expect(s.message()).toContain('combate');
  });

  it('desfaz e refaz', () => {
    const s = setup();
    const before = s.state();
    s.send({ type: 'rollInitiative' });
    expect(s.canUndo()).toBe(true);
    s.undo();
    expect(s.state()).toBe(before);
    expect(s.canRedo()).toBe(true);
    s.redo();
    expect(Object.keys(s.state().combat.initiative).length).toBeGreaterThan(0);
    s.send({ type: 'rollInitiative' });
    expect(s.canRedo()).toBe(false); // ação nova descarta o "refazer"
  });

  it('a visão do jogador não traz tokens ocultos', () => {
    const s = setup();
    const foe = s.state().creatures.find((c) => c.kind === 'monster')!;
    s.send({ type: 'setHidden', id: foe.id, hidden: true });
    const pc = s.state().creatures.find((c) => c.kind === 'pc')!;
    s.role.set({ kind: 'player', owns: [pc.id] });
    expect(s.view().tokens.some((t) => t.creatureId === foe.id)).toBe(false);
    expect(s.state().tokens.some((t) => t.creatureId === foe.id)).toBe(true);
  });

  it('jogador não consegue enviar comando de Mestre', () => {
    const s = setup();
    const pc = s.state().creatures.find((c) => c.kind === 'pc')!;
    s.role.set({ kind: 'player', owns: [pc.id] });
    expect(s.send({ type: 'startCombat' })).toBe(false);
    expect(s.message()).toContain('Mestre');
  });

  it('exporta e importa a sessão versionada', () => {
    const s = setup();
    s.send({ type: 'rollInitiative' });
    const expected = structuredClone(s.state());
    const text = s.exportSession();
    expect(JSON.parse(text)).toMatchObject({ format: 'runegrid-session', version: 1 });
    s.reset();
    expect(s.importSession(text)).toBe(true);
    expect(s.state()).toEqual(expected);
  });

  it('recusa sessão inválida sem substituir estado nem snapshot local', () => {
    const s = setup();
    const before = s.state();
    TestBed.tick();
    const saved = localStorage.getItem('runegrid.encounter.v2');
    expect(s.importSession('{"format":"runegrid-session","version":99,"state":{}}')).toBe(false);
    const malformed = JSON.parse(serializeSession(before));
    malformed.state.tokens = [{ creatureId: 'x' }];
    expect(parseSession(JSON.stringify(malformed))).toBeNull();
    TestBed.tick();
    expect(s.state()).toBe(before);
    expect(localStorage.getItem('runegrid.encounter.v2')).toBe(saved);
  });
});
