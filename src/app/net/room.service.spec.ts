import { TestBed } from '@angular/core/testing';
import { newEncounter } from '@core/rules/encounter';
import { mapFromAscii } from '@core/models/grid';
import { EncounterStore } from '@state/encounter.store';
import { RNG } from '@state/rng.token';
import type Peer from 'peerjs';
import { readRoomSnapshot, RoomService, RoomSnapshot, writeRoomSnapshot } from './room.service';

describe('snapshot da sala', () => {
  const snapshot = (): RoomSnapshot => ({
    version: 1,
    code: 'ABC234',
    state: newEncounter(mapFromAscii(['..']), 'Tumba'),
    assignments: { Ana: ['hero'] },
    savedAt: 123,
  });

  it('salva e restaura estado, código e atribuições do Mestre', () => {
    localStorage.clear();
    expect(writeRoomSnapshot(snapshot())).toBe(true);
    expect(readRoomSnapshot()).toEqual(snapshot());
  });

  it('ignora snapshot inválido ou corrompido', () => {
    localStorage.setItem('runegrid.room.snapshot.v1', '{');
    expect(readRoomSnapshot()).toBeNull();
    localStorage.setItem(
      'runegrid.room.snapshot.v1',
      JSON.stringify({ ...snapshot(), code: 'INVÁLIDO' }),
    );
    expect(readRoomSnapshot()).toBeNull();
    localStorage.setItem(
      'runegrid.room.snapshot.v1',
      JSON.stringify({ ...snapshot(), assignments: { Ana: 'hero' } }),
    );
    expect(readRoomSnapshot()).toBeNull();
  });
});

describe('retomada da sala', () => {
  it('reabre o mesmo código e carrega o encontro salvo', async () => {
    localStorage.clear();
    sessionStorage.clear();
    writeRoomSnapshot(snapshotForResume());
    TestBed.configureTestingModule({ providers: [{ provide: RNG, useValue: () => 0.5 }] });
    const room = TestBed.inject(RoomService);
    const peer = { id: 'runegrid-ABC234', on: vi.fn(), destroy: vi.fn() } as unknown as Peer;
    vi.spyOn(room as unknown as { open(id?: string): Promise<Peer> }, 'open').mockResolvedValue(
      peer,
    );

    await room.resume();

    expect(room.status()).toBe('hosting');
    expect(room.code()).toBe('ABC234');
    expect(TestBed.inject(EncounterStore).state().name).toBe('Tumba retomada');
    room.leave();
  });
});

function snapshotForResume(): RoomSnapshot {
  return {
    version: 1,
    code: 'ABC234',
    state: newEncounter(mapFromAscii(['..']), 'Tumba retomada'),
    assignments: { Ana: ['hero'] },
    savedAt: 456,
  };
}
