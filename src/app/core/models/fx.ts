/** Paleta nomeada dos efeitos visuais; a tela decide as cores reais (e o modo de alto contraste). */
export type FxColor =
  | 'violet'
  | 'shadow'
  | 'fire'
  | 'frost'
  | 'lightning'
  | 'holy'
  | 'life'
  | 'acid'
  | 'poison'
  | 'thunder'
  | 'psychic'
  | 'force'
  | 'arcane'
  | 'steel';

/** Ponto no mapa em células (centro), já com o tamanho da criatura considerado. */
export interface FxPoint {
  x: number;
  y: number;
}

/**
 * Efeito visual de uma ação, calculado pelo motor e mostrado pela tela. Não altera regras: vai
 * dentro da entrada do registro (`LogEntry.fx`) e some junto com ela para quem não a vê.
 */
export type Fx =
  /** Projéteis um atrás do outro (Mísseis Mágicos: `count` = dardos). */
  | { kind: 'bolts'; from: FxPoint; to: FxPoint; count: number; color: FxColor }
  | { kind: 'arrow'; from: FxPoint; to: FxPoint; color: FxColor }
  /** Raio contínuo do conjurador ao alvo. */
  | { kind: 'ray'; from: FxPoint; to: FxPoint; color: FxColor }
  /** O alvo brilha por um instante (cura, bênção, radiância). */
  | { kind: 'glow'; at: FxPoint; color: FxColor }
  /** Onda que se expande a partir de um ponto (`radius` em células). */
  | { kind: 'burst'; at: FxPoint; radius: number; color: FxColor }
  | { kind: 'cone'; from: FxPoint; to: FxPoint; length: number; color: FxColor }
  /** Golpe corpo a corpo sobre o alvo. */
  | { kind: 'slash'; from: FxPoint; at: FxPoint; color: FxColor };

/** Como uma magia se mostra; escrito magia a magia, a partir do texto dela. */
export interface SpellVfx {
  kind: 'bolts' | 'ray' | 'glow' | 'burst' | 'cone';
  color: FxColor;
  /** Brilho extra em cada alvo atingido, de outra cor. */
  impact?: FxColor;
  /** Raio da onda (pés) quando a área da magia não o diz (ex.: Detectar Magia, 30 ft). */
  radius?: number;
}
