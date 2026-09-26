import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renderiza o cabeçalho com a marca e a navegação', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand')?.textContent).toContain('Runegrid');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Criaturas', 'Dados']);
  });
});
