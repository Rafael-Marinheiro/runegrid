import { TestBed } from '@angular/core/testing';
import { mapFromAscii } from '@core/models/grid';
import { MapView, TokenView } from './map-view';

describe('MapView por toque', () => {
  function setup(tokens: TokenView[] = []) {
    const fixture = TestBed.createComponent(MapView);
    fixture.componentRef.setInput('map', mapFromAscii(['....', '....']));
    fixture.componentRef.setInput('tokens', tokens);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    svg.setPointerCapture = vi.fn();
    Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ a: 1 }) });
    vi.spyOn(
      component as unknown as {
        toSvg(e: { clientX: number; clientY: number }): { x: number; y: number };
      },
      'toSvg',
    ).mockImplementation((e) => ({ x: e.clientX, y: e.clientY }));
    return { component, fixture, svg };
  }

  it('arrasta token e encaixa na célula', () => {
    const token: TokenView = {
      id: 'hero',
      name: 'Heroína',
      letter: 'H',
      pos: { x: 0, y: 0 },
      size: 1,
      team: 'party',
      hpPct: 100,
      hidden: false,
      dead: false,
      active: false,
      selected: false,
      targetable: false,
      icon: null,
      conditions: 0,
      concentrating: false,
    };
    const { component, fixture } = setup([token]);
    const moved = vi.fn();
    component.tokenMove.subscribe(moved);
    const target = fixture.nativeElement.querySelector('[data-token="hero"]') as SVGGElement;

    touch(target, 'pointerdown', 1, 24, 24);
    touch(target, 'pointermove', 1, 72, 24);
    touch(target, 'pointerup', 1, 72, 24);

    expect(moved).toHaveBeenCalledWith({ id: 'hero', pos: { x: 1, y: 0 } });
  });

  it('amplia o mapa com pinça de dois dedos', () => {
    const { component, svg } = setup();

    touch(svg, 'pointerdown', 1, 100, 100);
    touch(svg, 'pointerdown', 2, 200, 100);
    touch(svg, 'pointermove', 2, 250, 100);

    expect((component as unknown as { zoom(): number }).zoom()).toBeCloseTo(1.5);
  });

  it('renderiza a imagem calibrada atrás do grid', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('map', {
      ...mapFromAscii(['....', '....']),
      background: {
        src: 'data:image/png;base64,AA==',
        widthPx: 400,
        heightPx: 200,
        pixelsPerCell: 100,
        offsetX: 0.5,
        offsetY: 1,
        opacity: 0.7,
      },
    });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('.map-background') as SVGImageElement;
    expect(image.getAttribute('x')).toBe('24');
    expect(image.getAttribute('y')).toBe('48');
    expect(image.getAttribute('width')).toBe('192');
    expect(image.getAttribute('opacity')).toBe('0.7');
  });
});

function touch(target: Element, type: string, pointerId: number, clientX: number, clientY: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId,
      pointerType: 'touch',
      clientX,
      clientY,
    }),
  );
}
