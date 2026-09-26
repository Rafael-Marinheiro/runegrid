import { TestBed } from '@angular/core/testing';
import { Die } from './die';

function make(value: number, sides = 20) {
  const fixture = TestBed.createComponent(Die);
  fixture.componentRef.setInput('sides', sides);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture;
}
const text = (f: ReturnType<typeof make>) =>
  (f.nativeElement as HTMLElement).querySelector('text')!.textContent;

describe('Die', () => {
  afterEach(() => vi.useRealTimers());

  it('pousa exatamente no valor decidido pelo motor', () => {
    vi.useFakeTimers();
    const f = make(17);
    vi.advanceTimersByTime(2000);
    f.detectChanges();
    expect(text(f)).toBe('17');
  });

  it('enquanto rola, mostra números dentro da faixa do dado', () => {
    vi.useFakeTimers();
    const f = make(3, 6);
    vi.advanceTimersByTime(300);
    f.detectChanges();
    const n = Number(text(f));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('com movimento reduzido mostra o resultado direto', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const f = make(9, 10);
    expect(text(f)).toBe('9');
    vi.unstubAllGlobals();
  });
});
