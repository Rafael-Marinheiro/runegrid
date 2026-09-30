import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FxColor } from '@core/models/fx';

/** Área de magia já em pixels do SVG do mapa (48 px por célula). */
export interface ZoneView {
  id: number;
  name: string;
  color: FxColor;
  obscures?: boolean;
  shape:
    | { kind: 'circle'; cx: number; cy: number; r: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'poly'; points: string };
}

/**
 * Áreas que as magias deixam no mapa (Teia, Névoa, Guardiões Espirituais). Só desenho: contorno
 * tracejado e um véu leve na cor da magia; o nome vai no tooltip para leitores de tela e mouse.
 */
@Component({
  // atributo em <g>: dentro de <svg> só elementos SVG renderizam
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[app-zone-layer]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (z of zones(); track z.id) {
      <svg:g class="zone" [class]="'zone c-' + z.color" [class.fog]="z.obscures">
        <svg:title>{{ z.name }}</svg:title>
        @switch (z.shape.kind) {
          @case ('circle') {
            <circle [attr.cx]="z.shape.cx" [attr.cy]="z.shape.cy" [attr.r]="z.shape.r" />
          }
          @case ('rect') {
            <rect
              [attr.x]="z.shape.x"
              [attr.y]="z.shape.y"
              [attr.width]="z.shape.w"
              [attr.height]="z.shape.h"
            />
          }
          @case ('poly') {
            <polygon [attr.points]="z.shape.points" />
          }
        }
      </svg:g>
    }
  `,
  styles: `
    .zone {
      pointer-events: none;
      --z: #9db4d8;
      fill: var(--z);
      fill-opacity: 0.16;
      stroke: var(--z);
      stroke-width: 2;
      stroke-dasharray: 6 4;
      &.fog {
        fill-opacity: 0.4;
      }
      &.c-violet {
        --z: #a66bff;
      }
      &.c-shadow {
        --z: #5b2bb0;
      }
      &.c-fire {
        --z: #ff7a2e;
      }
      &.c-frost {
        --z: #7fd6ff;
      }
      &.c-lightning {
        --z: #ffe94d;
      }
      &.c-holy {
        --z: #ffe9a3;
      }
      &.c-life {
        --z: #6fe39a;
      }
      &.c-acid {
        --z: #a4e32b;
      }
      &.c-poison {
        --z: #5fbf4a;
      }
      &.c-thunder {
        --z: #9db4d8;
      }
      &.c-psychic {
        --z: #ff6bd6;
      }
      &.c-force {
        --z: #6bb6ff;
      }
      &.c-arcane {
        --z: #c79bff;
      }
      &.c-steel {
        --z: #c8ced6;
      }
    }
  `,
})
export class ZoneLayer {
  readonly zones = input<ZoneView[]>([]);
}
