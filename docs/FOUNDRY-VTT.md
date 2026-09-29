# Interoperabilidade com Foundry VTT

O Estúdio importa e exporta um subconjunto de `SceneData` do Foundry VTT v13.

## Campos suportados

- cena: `name`, `width`, `height`, `background`, `grid` e `tokenVision`;
- paredes: `walls[].c`, `door` e `ds`;
- tokens: `name`, `x`, `y`, `width`, `height`, `hidden`, `disposition` e `texture.src`.

O Runegrid usa células para paredes, enquanto o Foundry usa segmentos. Na exportação, as células originais ficam em `flags.runegrid` para que o round-trip Runegrid → Foundry → Runegrid seja exato. Ao importar uma cena externa sem essas flags, segmentos horizontais e verticais são rasterizados para a célula imediatamente acima ou à esquerda.

Estados de porta seguem as constantes do Foundry: `0` fechada, `1` aberta e `2` trancada. Tokens importados recebem estatísticas básicas do Runegrid; fichas de Actor, luzes, sons, desenhos, tiles, notas e efeitos não são convertidos.

Referências: [SceneData v13](https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.SceneData.html), [TokenData v13](https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.TokenData.html) e [importação de cenas](https://foundryvtt.com/article/scenes/).
