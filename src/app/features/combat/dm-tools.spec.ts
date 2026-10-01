import { TestBed } from '@angular/core/testing';
import { newCreature } from '@core/models/creature-factory';
import { EncounterStore } from '@state/encounter.store';
import { DmTools } from './dm-tools';

describe('DmTools', () => {
  it('o ajuste livre exige descrição e altera a criatura ao aplicar', () => {
    const store = TestBed.inject(EncounterStore);
    const target = store.state().creatures[0];
    const fixture = TestBed.createComponent(DmTools);
    fixture.componentRef.setInput('c', newCreature(target.kind, { ...target }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const form = el.querySelector('form')!;
    const field = (n: string) => form.querySelector<HTMLInputElement>(`[name="${n}"]`)!;
    expect(field('note').required).toBe(true);

    field('ac').value = '3';
    field('note').value = 'Ferrugem corroeu a armadura';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const after = store.state().creatures.find((c) => c.id === target.id)!;
    expect(after.ac).toBe(3);
    expect(store.state().log.at(-1)?.text).toContain('Ferrugem corroeu a armadura');
  });
});
