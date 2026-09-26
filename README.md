# Runegrid — D&D 5e

Mesa virtual de D&D 5e em grid, com Mestre autoritativo, editor de dungeons e gerador de desafios.
Feito com Angular (standalone, signals, zoneless). Plano completo e backlog em [PLANO.md](PLANO.md).

```bash
npm install
npm start          # http://localhost:4200
npm run test:ci    # testes (Vitest)
npm run lint
npm run build
```

## Estrutura

- `src/app/core/rules` — regras em TypeScript puro (sem Angular), testadas em isolamento.
- `src/app/state` — stores com signals.
- `src/app/features` — telas (lazy).

Conteúdo baseado no SRD 5.1 da Wizards of the Coast, licenciado sob CC-BY-4.0.
