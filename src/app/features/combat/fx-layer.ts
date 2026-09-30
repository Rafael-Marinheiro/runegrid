import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Fx, FxPoint } from '@core/models/fx';

const CELL = 48;

/** Efeito visual em cartaz, com chave estável para a tela animar uma vez só. */
export interface FxView {
  key: string;
  fx: Fx;
}

/**
 * Camada de efeitos visuais do mapa (magias, golpes): só enfeite, nunca altera regra. Vai dentro
 * do `<svg>` do mapa, em células de 48 px; sem movimento (`prefers-reduced-motion`) troca
 * projéteis e ondas por um realce breve no destino.
 */
@Component({
  // atributo em <g>: dentro de <svg> só elementos SVG renderizam, então não pode ser elemento próprio
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[app-fx-layer]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (e of effects(); track e.key) {
      @let f = e.fx;
      <svg:g class="fx" [class]="'fx c-' + f.color" aria-hidden="true">
        @switch (f.kind) {
          @case ('bolts') {
            @let g = geom(f.from, f.to);
            <g [attr.transform]="'translate(' + g.x1 + ' ' + g.y1 + ') rotate(' + g.ang + ')'">
              @for (n of range(f.count); track n) {
                <circle
                  class="bolt"
                  r="6"
                  [style.--len.px]="g.len"
                  [style.animation-delay.s]="n * 0.18"
                />
              }
            </g>
            <circle class="still" [attr.cx]="g.x2" [attr.cy]="g.y2" [attr.r]="C * 0.5" />
          }
          @case ('arrow') {
            @let g = geom(f.from, f.to);
            <g [attr.transform]="'translate(' + g.x1 + ' ' + g.y1 + ') rotate(' + g.ang + ')'">
              <ellipse class="bolt arrow" rx="11" ry="2.2" [style.--len.px]="g.len" />
            </g>
            <circle class="still" [attr.cx]="g.x2" [attr.cy]="g.y2" [attr.r]="C * 0.4" />
          }
          @case ('ray') {
            @let g = geom(f.from, f.to);
            <line
              class="ray-glow"
              [attr.x1]="g.x1"
              [attr.y1]="g.y1"
              [attr.x2]="g.x2"
              [attr.y2]="g.y2"
            />
            <line
              class="ray"
              pathLength="1"
              [attr.x1]="g.x1"
              [attr.y1]="g.y1"
              [attr.x2]="g.x2"
              [attr.y2]="g.y2"
            />
            <circle class="still" [attr.cx]="g.x2" [attr.cy]="g.y2" [attr.r]="C * 0.5" />
          }
          @case ('glow') {
            <circle
              class="glow"
              [attr.cx]="f.at.x * C"
              [attr.cy]="f.at.y * C"
              [attr.r]="C * 0.55"
            />
            <circle
              class="still"
              [attr.cx]="f.at.x * C"
              [attr.cy]="f.at.y * C"
              [attr.r]="C * 0.5"
            />
          }
          @case ('burst') {
            <circle
              class="burst"
              [attr.cx]="f.at.x * C"
              [attr.cy]="f.at.y * C"
              [attr.r]="f.radius * C"
            />
            <circle
              class="still"
              [attr.cx]="f.at.x * C"
              [attr.cy]="f.at.y * C"
              [attr.r]="f.radius * C"
            />
          }
          @case ('cone') {
            <path
              class="cone"
              [attr.d]="conePath(f.from, f.to, f.length)"
              [style.transform-origin]="f.from.x * C + 'px ' + f.from.y * C + 'px'"
            />
            <path class="still" [attr.d]="conePath(f.from, f.to, f.length)" />
          }
          @case ('slash') {
            @let g = geom(f.from, f.at);
            <g [attr.transform]="'translate(' + g.x2 + ' ' + g.y2 + ') rotate(' + g.ang + ')'">
              <path class="slash" pathLength="1" d="M -16 -16 Q 10 0 -16 16" />
            </g>
            <circle class="still" [attr.cx]="g.x2" [attr.cy]="g.y2" [attr.r]="C * 0.4" />
          }
        }
      </svg:g>
    }
  `,
  styles: `
    /* Efeitos visuais de magia e golpe (só enfeite; o estado do jogo não depende deles) */
    .fx {
      pointer-events: none;
      --fx: #ffffff;
      --fx2: #ffffff;
      &.c-violet {
        --fx: #a66bff;
        --fx2: #e3cfff;
      }
      &.c-shadow {
        --fx: #1a1026;
        --fx2: #7a3cff;
      }
      &.c-fire {
        --fx: #ff7a2e;
        --fx2: #ffd27a;
      }
      &.c-frost {
        --fx: #7fd6ff;
        --fx2: #eaffff;
      }
      &.c-lightning {
        --fx: #ffe94d;
        --fx2: #ffffff;
      }
      &.c-holy {
        --fx: #ffe9a3;
        --fx2: #ffffff;
      }
      &.c-life {
        --fx: #6fe39a;
        --fx2: #eafff1;
      }
      &.c-acid {
        --fx: #a4e32b;
        --fx2: #f0ffb0;
      }
      &.c-poison {
        --fx: #5fbf4a;
        --fx2: #c8f5a8;
      }
      &.c-thunder {
        --fx: #9db4d8;
        --fx2: #ffffff;
      }
      &.c-psychic {
        --fx: #ff6bd6;
        --fx2: #ffd6f4;
      }
      &.c-force {
        --fx: #6bb6ff;
        --fx2: #dff0ff;
      }
      &.c-arcane {
        --fx: #8fa6ff;
        --fx2: #e0e6ff;
      }
      &.c-steel {
        --fx: #dcdcdc;
        --fx2: #ffffff;
      }

      .bolt {
        fill: var(--fx);
        stroke: var(--fx2);
        stroke-width: 2;
        filter: drop-shadow(0 0 5px var(--fx));
        opacity: 0;
        animation: fx-travel 0.5s ease-in both;
      }
      .arrow {
        filter: none;
        animation-duration: 0.35s;
      }
      .ray,
      .ray-glow {
        stroke: var(--fx);
        stroke-linecap: round;
        fill: none;
      }
      .ray {
        stroke: var(--fx2);
        stroke-width: 3;
        stroke-dasharray: 1;
        animation: fx-ray 0.9s ease-out both;
      }
      .ray-glow {
        stroke-width: 10;
        opacity: 0;
        filter: drop-shadow(0 0 6px var(--fx));
        animation: fx-fade 0.9s ease-out both;
      }
      .glow {
        fill: var(--fx);
        opacity: 0;
        filter: drop-shadow(0 0 10px var(--fx2));
        transform-box: fill-box;
        transform-origin: center;
        animation: fx-glow 0.9s ease-out both;
      }
      .burst {
        fill: var(--fx);
        stroke: var(--fx2);
        stroke-width: 3;
        opacity: 0;
        transform-box: fill-box;
        transform-origin: center;
        animation: fx-burst 0.8s ease-out both;
      }
      .cone {
        fill: var(--fx);
        stroke: var(--fx2);
        stroke-width: 2;
        opacity: 0;
        animation: fx-cone 0.8s ease-out both;
      }
      .slash {
        fill: none;
        stroke: var(--fx2);
        stroke-width: 5;
        stroke-linecap: round;
        stroke-dasharray: 1;
        filter: drop-shadow(0 0 4px var(--fx));
        animation: fx-slash 0.35s ease-out both;
      }
      .still {
        display: none;
        fill: var(--fx);
        opacity: 0;
      }
    }
    @keyframes fx-travel {
      0% {
        opacity: 1;
        transform: translateX(0);
      }
      100% {
        opacity: 1;
        transform: translateX(var(--len));
      }
    }
    @keyframes fx-ray {
      0% {
        stroke-dashoffset: 1;
        opacity: 1;
      }
      45% {
        stroke-dashoffset: 0;
        opacity: 1;
      }
      100% {
        stroke-dashoffset: 0;
        opacity: 0;
      }
    }
    @keyframes fx-fade {
      0% {
        opacity: 0;
      }
      30% {
        opacity: 0.6;
      }
      100% {
        opacity: 0;
      }
    }
    @keyframes fx-glow {
      0% {
        opacity: 0;
        transform: scale(0.5);
      }
      35% {
        opacity: 0.85;
        transform: scale(1.15);
      }
      100% {
        opacity: 0;
        transform: scale(1.5);
      }
    }
    @keyframes fx-burst {
      0% {
        opacity: 0.9;
        transform: scale(0.1);
      }
      100% {
        opacity: 0;
        transform: scale(1);
      }
    }
    @keyframes fx-cone {
      0% {
        opacity: 0.9;
        transform: scale(0.2);
      }
      100% {
        opacity: 0;
        transform: scale(1);
      }
    }
    @keyframes fx-slash {
      0% {
        stroke-dashoffset: 1;
        opacity: 1;
      }
      60% {
        stroke-dashoffset: 0;
        opacity: 1;
      }
      100% {
        stroke-dashoffset: 0;
        opacity: 0;
      }
    }
    /* Sem movimento: em vez de projéteis e ondas, um realce breve só no destino */
    @media (prefers-reduced-motion: reduce) {
      .fx {
        .bolt,
        .ray,
        .ray-glow,
        .glow,
        .burst,
        .cone,
        .slash {
          display: none;
        }
        .still {
          display: block;
          animation: fx-fade 0.9s ease-out both;
        }
      }
    }
  `,
})
export class FxLayer {
  readonly effects = input<FxView[]>([]);

  protected readonly C = CELL;

  /** Geometria em pixels do trajeto entre dois pontos (em células). */
  protected geom(a: FxPoint, b: FxPoint) {
    const x1 = a.x * CELL;
    const y1 = a.y * CELL;
    const dx = b.x * CELL - x1;
    const dy = b.y * CELL - y1;
    const rad = Math.atan2(dy, dx);
    return {
      x1,
      y1,
      x2: x1 + dx,
      y2: y1 + dy,
      len: Math.hypot(dx, dy),
      ang: (rad * 180) / Math.PI,
      rad,
    };
  }

  protected range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  /** Triângulo do cone (≈53°, como o cone de 5e) saindo de `a` na direção de `b`. */
  protected conePath(a: FxPoint, b: FxPoint, length: number): string {
    const g = this.geom(a, b);
    const reach = length * CELL;
    const half = Math.atan(0.5);
    const p = (s: number) =>
      `${g.x1 + reach * Math.cos(g.rad + s)} ${g.y1 + reach * Math.sin(g.rad + s)}`;
    return `M ${g.x1} ${g.y1} L ${p(-half)} L ${p(half)} Z`;
  }
}
