import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { DiceStage, StageDie } from './dice-stage';

/**
 * Bandeja 3D: rola os dados com física e devolve o controle quando param.
 * Three.js e cannon-es ficam num chunk separado, carregado só na primeira rolagem.
 * Se o WebGL falhar ou o dado não for suportado, emite `failed` e a página usa os dados 2D.
 */
@Component({
  selector: 'app-dice-tray-3d',
  template: `<canvas #cv aria-hidden="true" [style.height.px]="height()"></canvas>`,
  styles: `
    :host {
      display: block;
    }
    canvas {
      display: block;
      width: 100%;
      height: 300px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiceTray3d {
  readonly dice = input.required<StageDie[]>();
  readonly seed = input.required<number>();
  readonly height = input(300);
  readonly settled = output<void>();
  readonly failed = output<void>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private stage?: DiceStage;
  private gone = false;

  constructor() {
    afterRenderEffect(() => {
      const dice = this.dice();
      const seed = this.seed();
      untracked(() => void this.run(dice, seed));
    });
    inject(DestroyRef).onDestroy(() => {
      this.gone = true;
      this.stage?.dispose();
    });
  }

  private async run(dice: StageDie[], seed: number): Promise<void> {
    try {
      const { DiceStage } = await import('./dice-stage');
      if (this.gone) return;
      if (!DiceStage.supports(dice)) return this.failed.emit();
      this.stage ??= new DiceStage(this.canvas().nativeElement);
      if (await this.stage.roll(dice, seed)) this.settled.emit();
    } catch (e) {
      console.warn('Dados 3D indisponíveis, usando o modo 2D.', e);
      this.failed.emit();
    }
  }
}
