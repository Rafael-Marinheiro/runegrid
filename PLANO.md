# Runegrid — Plano de Desenvolvimento (D&D 5e)

Tático de combate em grid para D&D 5e, feito em Angular. Projeto de portfólio: o foco é **arquitetura limpa, regras testadas e UX polida**, não cobrir o livro inteiro.

## Status

- **Fase 0:** F0-1, F0-2 (lint + Prettier; sem hook de commit, o CI cobre), F0-3, F0-4 (tokens em `styles.scss`), F0-5, F0-7 concluídos. F0-6 em andamento (projeto na Vercel, time Hobby). Pendente: F0-8 (tipos base de criatura).
- **Fase 1:** F1-1 a F1-5 concluídos (parser, RNG com semente, vantagem/crítico, rolador, histórico). F1-6 concluído (dados animados que pousam no resultado do motor, com movimento reduzido respeitado). Próximo: F1-6b (bandeja reutilizável), F1-7 (macros).

## 1. Visão e escopo

**Produto:** mesa virtual de D&D 5e em grid, **multiplayer com Mestre autoritativo**.

- **Mestre (DM)** controla o mundo: cria e detalha dungeons/mapas, posiciona monstros e armadilhas, revela névoa, conduz o combate, pode corrigir/sobrescrever qualquer coisa.
- **Jogadores** controlam apenas os próprios personagens (mover, atacar, conjurar, usar itens, rolar), **sempre dentro das regras**: só na sua vez, respeitando ação/ação bônus/reação/deslocamento, sem ver o que o Mestre não revelou.

**Dentro do escopo (MVP → v1):** combate 5e (SRD), fichas simplificadas, monstros do SRD, mapa em grid quadrado, editor de dungeons, salas multiplayer em tempo real, campanhas salvas na nuvem.

**Fora do escopo (por ora):** criação completa de personagem com todas as classes/subclasses, grid hexagonal, regras de variante, conteúdo não-SRD, vídeo. (Voz entra no escopo: F8-15.)

**Decisões-chave (revise se discordar):**

| Tema | Decisão | Por quê |
|---|---|---|
| Conteúdo | **SRD 5.1 (CC-BY-4.0)** via dados próprios + [Open5e API](https://open5e.com) | Evita problema de copyright com material da WotC; credite a licença no rodapé |
| "Mana" | D&D não tem mana: usar **espaços de magia (spell slots)** e recursos (ki, fúrias, etc.) | Fidelidade ao sistema; é um diferencial mostrar que você entendeu as regras |
| Angular | v20+, standalone, **signals**, zoneless, control flow `@if/@for` | Estado atual da plataforma |
| Estado | Stores com `signal`/`computed` (sem NgRx no início) | Suficiente; NgRx adicionaria cerimônia sem ganho |
| Renderização do grid | **SVG** dentro de um componente (tokens = `<g>`) | Acessível, escalável, DOM-inspecionável; canvas só se houver gargalo |
| Regras | **Núcleo em TypeScript puro** (`core/rules`), sem dependência de Angular | Testável em isolamento, é o "cérebro" do projeto |
| Autoridade | **Mestre autoritativo, modelo de comandos**: jogador envia `Command` → o cliente do Mestre valida com `core/rules` → aplica → publica evento/estado | Impede trapaça sem servidor de jogo; o mesmo motor de regras roda solo e multiplayer |
| Visibilidade | Cada jogador recebe uma **projeção** do estado (névoa, monstros ocultos, HP de inimigos escondido) | Segredo nunca sai do cliente do Mestre |
| Backend | **Supabase**: Auth (login), Postgres + RLS (campanhas, mapas, fichas), Realtime (canal por sala) | Cobre conta, persistência e tempo real sem servidor próprio |
| Persistência | Nuvem (Supabase) para campanhas/mapas/fichas; `localStorage` para modo solo/offline; export/import JSON | Mestre reutiliza dungeons entre sessões |
| Testes | Vitest/Jest para regras, Playwright para 2–3 fluxos E2E | Regras são onde bugs custam caro |
| Deploy | Vercel ou GitHub Pages + CI (lint, test, build) | Portfólio precisa de link vivo |

## 2. Arquitetura

```
src/app/
  core/
    rules/          # TS puro: dados, ataque, dano, condições, iniciativa, slots
    models/         # tipos: Creature, Item, Spell, Encounter, GridMap...
    data/           # SRD em JSON (monstros, magias, itens, condições)
  state/            # stores com signals: encounter.store, map.store, party.store
  features/
    dice/           # rolador + histórico
    combat/         # tracker de iniciativa, turno, ações
    map/            # grid SVG, tokens, movimento, fog
    sheet/          # ficha de criatura (HP, slots, atributos)
    inventory/      # itens, equipamento
    bestiary/       # busca de monstros/magias, encounter builder
    dm/             # editor de dungeons, painel do Mestre, fog, gatilhos
    lobby/          # login, campanhas, criar/entrar em sala
  net/              # transporte realtime (Supabase), sessão, papéis
  shared/           # UI kit pequeno, pipes, diretivas
```

Regra de ouro: **UI emite `Command` → validador (`core/rules`) decide → estado novo imutável + `Event`.** Nada muda o estado direto. Isso dá, de graça: undo/redo, log de combate, testes puros e o multiplayer (o comando do jogador só viaja até o Mestre).

```
Jogador ──Command──▶ Mestre (valida por papel + regras) ──Event/estado projetado──▶ Todos
```

- **Papéis:** `dm` pode qualquer comando; `player` só comandos cujo `actorId` seja uma criatura sua, na sua vez (ou reação válida).
- **Projeção por papel:** `project(state, role)` remove névoa, tokens ocultos, notas do Mestre e detalhes de inimigos não revelados.
- **Reconexão:** cliente pede snapshot ao entrar; depois só recebe eventos (com número de sequência para detectar lacunas).
- **Decisão importante:** desenhar o modelo de comandos **já na Fase 4**. Adaptar depois custa reescrever todas as features.

## 3. Roadmap por fases

| Fase | Objetivo | Entrega demonstrável |
|---|---|---|
| **0 — Fundação** | Projeto, CI, design tokens, estrutura | App vazio deployado |
| **1 — Dados** | Motor de dados + UI | Rolar `2d6+3`, vantagem/desvantagem, histórico |
| **2 — Criaturas** | Modelo + ficha (HP, atributos, CA, slots) | Criar/editar PJs e monstros |
| **3 — Grid** | Mapa SVG, tokens, arrastar, movimento | Mover token com custo de deslocamento |
| **4 — Combate** | Iniciativa, turnos, ações, ataque/dano | **MVP jogável** (marco principal) |
| **5 — Regras ricas** | Condições, magias/slots, reações, morte | Combate fiel à 5e |
| **6 — Conteúdo** | Bestiário SRD, itens, encounter builder | Montar e rodar encontro em minutos |
| **7 — Estúdio do Mestre** | Editor de dungeons/mapas, fog, gatilhos, áreas de efeito | Criar uma dungeon com salas, portas, armadilhas e monstros |
| **7B — Gerador de desafios** | Mestre escolhe tema/terreno/tamanho → mapa + encontros + armadilhas + loot gerados | Dungeon jogável em 1 clique, com semente compartilhável |
| **8 — Multiplayer** | Login, salas, papéis, comandos, projeção por jogador | Mestre + 2 jogadores jogando em navegadores diferentes |
| **9 — Polimento** | Undo/redo, a11y, PWA, testes E2E, docs | Versão de portfólio |
| **10 — Stretch** | Importar VTT, IA de NPC, hex grid | Opcional |

Ordem sugerida de esforço: Fases 0–4 são o núcleo, mas a **Fase 4 já nasce com comandos/eventos** (F4-0). O ponto de corte realista é **após a Fase 8**; se o tempo apertar, a Fase 6 pode ser reduzida ao mínimo (bestiário simples) para chegar ao multiplayer.

## 4. Backlog

Legenda: **P0** essencial (MVP) · **P1** importante · **P2** desejável. Estimativa: **S** ≤ 0,5 dia · **M** 1–2 dias · **L** 3–5 dias.

### Fase 0 — Fundação
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F0-1 | `ng new` (standalone, zoneless, SCSS, strict) | P0 | S | Build e serve rodam |
| F0-2 | ESLint + Prettier + hook de commit | P0 | S | `npm run lint` limpo |
| F0-3 | Estrutura de pastas + aliases de path (`@core`, `@features`) | P0 | S | Imports por alias funcionam |
| F0-4 | Design tokens (cores, espaçamento, tipografia, tema escuro) | P1 | M | Tokens em CSS vars, sem cores hardcoded |
| F0-5 | CI (GitHub Actions: lint + test + build) | P0 | S | PR falha se algo quebrar |
| F0-6 | Deploy automático (Vercel/Pages) | P1 | S | URL pública atualizada no merge |
| F0-7 | Roteamento base + layout shell | P0 | S | Navegação entre features (lazy) |
| F0-8 | Tipos base (`Creature`, `Ability`, `Dice`...) | P0 | M | Modelos em `core/models` com testes de tipo |

### Fase 1 — Dados
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F1-1 | Parser de notação (`NdM+K`, `kh/kl`, `!` explosão opcional) | P0 | M | Suite cobre entradas válidas/inválidas |
| F1-2 | RNG injetável (seed opcional) | P0 | S | Testes determinísticos via seed |
| F1-3 | Vantagem/desvantagem, crítico (dobra dados) | P0 | S | d20 com adv retorna ambos os dados |
| F1-4 | Rolador UI (botões d4–d100, campo livre, resultado detalhado) | P0 | M | Mostra cada dado + total |
| F1-5 | Histórico de rolagens (filtro, limpar) | P1 | S | Persiste na sessão |
| F1-6 | **Lançamento visual de dados**: d4/d6/d8/d10/d12/d20/d100 animados (SVG/CSS 3D), rolando e **pousando no resultado já decidido** pelo motor | P1 | L | Face final = valor do RNG (teste); vários dados na mesma rolagem; `prefers-reduced-motion` mostra só o resultado |
| F1-6b | Componente `<app-dice-tray>` reutilizável (bandeja no mapa/painel), destaque de crítico (20) e falha crítica (1), vantagem mostra os 2 d20 e descarta um | P1 | M | Usado por ataque, dano e salvaguarda |
| F1-6c | Som de dados opcional + volume/mudo | P2 | S | Desligado por padrão |
| F1-6d | Modo "dados físicos 3D" (Three.js + física, carregado sob demanda) | P2 | L | Lazy chunk; não afeta o bundle inicial |
| F1-7 | Macros salvas (`Ataque espada: 1d20+5`) | P2 | S | CRUD local |

### Fase 2 — Criaturas e ficha
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F2-1 | Modelo Creature (atributos, CA, HP, velocidade, tamanho, proficiência) | P0 | M | Modificadores derivados via `computed` |
| F2-2 | Ficha (edição de atributos, salvaguardas, perícias) | P0 | L | Bônus calculados corretamente |
| F2-3 | Controle de HP (dano, cura, HP temporário) | P0 | M | Temp HP absorve antes; HP ≥ 0 e ≤ máx |
| F2-4 | Morte: 0 HP, salvaguardas contra morte, estabilizar | P1 | M | 3 sucessos/falhas, crítico = 2 falhas |
| F2-5 | Espaços de magia por nível + recursos (usos, descanso curto/longo) | P0 | M | Gastar/recuperar; descanso restaura o certo |
| F2-6 | Resistências/imunidades/vulnerabilidades | P1 | M | Dano ajustado por tipo |
| F2-7 | Lista de PJs/NPCs (CRUD, duplicar, avatar/cor) | P0 | M | Persistido |

### Fase 3 — Grid e movimento
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F3-1 | Grid SVG (tamanho configurável, 5 ft/célula, zoom, pan) | P0 | L | Zoom/pan fluidos a 60 fps em 50×50 |
| F3-2 | Tokens (posição, tamanho 1×1/2×2/3×3, cor/imagem) | P0 | M | Token grande ocupa várias células |
| F3-3 | Arrastar e soltar com snap ao grid (mouse + toque) | P0 | M | Funciona em desktop e mobile |
| F3-4 | Colisão e ocupação (não sobrepor; terreno bloqueante) | P0 | M | Movimento inválido é recusado |
| F3-5 | Custo de movimento (deslocamento gasto, terreno difícil, diagonal 5-10-5 ou 5 ft) | P0 | M | Regra de diagonal configurável |
| F3-6 | Pathfinding A* + pré-visualização do alcance | P1 | M | Mostra células alcançáveis |
| F3-7 | Régua/medição de distância | P1 | S | Distância em ft com regra de diagonal |
| F3-8 | Navegação por teclado no grid (a11y) | P1 | M | Selecionar/mover token só com teclado |
| F3-9 | **Ícones nos tokens** (classe para PJs, tipo/criatura para monstros) + fallback com inicial e cor; upload de imagem própria | P1 | M | Set de ícones SVG em sprite; licença atribuída (ex.: game-icons.net, CC BY 3.0) |
| F3-10 | **Texturas de piso** por terreno/tema (pedra, terra, madeira, água, lava…) com contraste controlado para não competir com os tokens | P1 | M | Token legível sobre qualquer textura (razão de contraste do anel ≥ 3:1) |
| F3-11 | Identificação de equipe **sem depender só de cor** (anel PJ = sólido dourado, inimigo = tracejado/forma), + opção alto contraste / textura reduzida | P1 | S | Distinguível em simulação de daltonismo |

### Fase 4 — Combate (MVP jogável)
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F4-0 | **Modelo Command/Event** + validador por papel (`dm`/`player`) + `project(state, role)` (ainda local) | P0 | L | Toda mutação passa por `dispatch(cmd)`; jogador não move criatura alheia (teste) |
| F4-1 | Iniciativa (rolar para todos, ordenar, desempate por Des) | P0 | M | Ordem correta; edição manual |
| F4-2 | Máquina de estado do combate (`preparação → em curso → fim`), rodadas/turnos | P0 | M | Passar turno, contar rodadas |
| F4-3 | Orçamento de ação: ação, ação bônus, reação, movimento | P0 | M | Reseta no início do turno |
| F4-4 | Ataque: acerto vs CA, crítico/falha crítica, vantagem | P0 | L | Rolagem + resultado explicados no log |
| F4-5 | Dano com tipo e aplicação no alvo (resistência etc.) | P0 | M | HP do alvo atualizado; testes por tipo |
| F4-6 | Log de combate (linha do tempo legível) | P0 | M | Cada evento com ator, alvo, valores |
| F4-7 | Undo/redo do combate | P1 | M | Reverte ataque/movimento/turno |
| F4-8 | Salvaguardas (CD, dano parcial em sucesso) | P1 | M | Área com múltiplos alvos |
| F4-9 | Fim de combate (resumo, XP opcional) | P2 | S | Tela de resumo |

### Fase 5 — Regras ricas
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F5-1 | Condições SRD (blinded, prone, stunned…) com efeitos mecânicos | P0 | L | Ex.: prone dá desvantagem ao atacar; testado |
| F5-2 | Duração de condições/efeitos (fim do turno, X rodadas) | P1 | M | Expira automaticamente |
| F5-3 | Concentração (teste ao sofrer dano, uma por vez) | P1 | M | CD = max(10, dano/2) |
| F5-4 | Conjuração (nível, slot, upcast, ação/bônus/reação) | P0 | L | Gasta slot correto; upcast escala dano |
| F5-5 | Ataques de oportunidade (reação ao sair do alcance) | P1 | M | Disparado pelo movimento, com opção de recusar |
| F5-6 | Cobertura, visibilidade básica | P2 | M | Bônus de CA por cobertura |
| F5-7 | Ações padrão (Dash, Dodge, Disengage, Help, Hide) | P1 | M | Efeitos aplicados |
| F5-8 | Rolagem de dano de arma com propriedades (finesse, versatile) | P2 | M | Modificador correto |

### Fase 6 — Conteúdo (bestiário, itens, encontros)
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F6-1 | Importar SRD (monstros/magias/itens) → JSON local versionado | P0 | M | Script reproduzível, créditos da licença |
| F6-2 | Bestiário com busca/filtro (ND, tipo, nome) | P0 | M | Busca instantânea (virtual scroll) |
| F6-3 | Adicionar monstro ao encontro (blocos de stat → Creature) | P0 | M | HP rolado ou médio |
| F6-4 | Compêndio de magias com filtros | P1 | M | Filtro por nível/escola/classe |
| F6-5 | Inventário (itens, peso, quantidade, equipar) | P1 | L | Equipar altera CA/dano |
| F6-6 | Itens consumíveis (poção de cura usa ação e rola) | P1 | M | Integra ao orçamento de ação |
| F6-7 | Encounter builder (dificuldade por XP budget) | P2 | M | Fácil/Médio/Difícil/Mortal |
| F6-8 | Loot/tesouro aleatório | P2 | M | Tabela simples |

### Fase 7 — Estúdio do Mestre (dungeons e mapas)
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F7-1 | Editor de mapa: pincel de piso, paredes, terreno difícil, água/lava | P0 | L | Desenhar, desfazer, salvar |
| F7-2 | Portas (aberta/fechada/trancada/secreta) e estados | P0 | M | Jogador só abre porta destrancada, dentro da regra |
| F7-3 | Salas/áreas nomeadas com descrição (texto lido aos jogadores) | P0 | M | Revelar sala exibe descrição |
| F7-4 | Posicionar monstros/NPCs/itens no mapa (ocultos até revelar) | P0 | M | Token oculto não aparece na projeção do jogador |
| F7-5 | Fog of war por célula/sala (revelar/ocultar) | P0 | L | Mestre revela; jogador só vê o revelado |
| F7-6 | Armadilhas e gatilhos (célula → efeito: dano, salvaguarda, condição) | P1 | L | Pisar dispara salvaguarda + dano automático |
| F7-7 | Imagem de fundo + calibragem do grid | P1 | M | Alinha imagem à célula |
| F7-8 | Linha de visão e visão no escuro (ray-casting contra paredes) | P1 | L | Fog dinâmico por token de jogador |
| F7-9 | Áreas de efeito (cone, esfera, linha, cubo) | P1 | M | Destaca alvos afetados |
| F7-10 | Notas secretas do Mestre (por sala, monstro, mapa) | P1 | S | Nunca entram na projeção do jogador |
| F7-11 | Múltiplos andares/mapas ligados (escadas, portais) | P2 | M | Grupo transita entre mapas |
| F7-12 | Biblioteca de dungeons + duplicar/exportar/importar | P1 | M | Lista com thumbnail; JSON |
| F7-14 | Pincel de **texturas** no editor (conjuntos por tema; variação aleatória de ladrilho para não repetir padrão) | P1 | M | Mesmo tileset usado pelo gerador (G-5) |

### Fase 7B — Gerador de desafios (randomização)

O Mestre escolhe **tema, terreno, tamanho** (e nível/tamanho do grupo, dificuldade); a ferramenta gera um desafio completo e **editável** no Estúdio. Depende de F1-2 (RNG com semente), F6-3/F6-7/F6-8 (bestiário, encounter builder, loot) e F7-1…F7-6 (modelo de mapa, portas, armadilhas).

**Entradas:** tema (cripta, caverna, ruínas, floresta, pântano, fortaleza, esgoto…) · terreno/bioma · tamanho (pequeno ≈ 5 salas, médio ≈ 10, grande ≈ 20, ou área em células) · nível médio e nº de PJs · dificuldade (fácil→mortal) · ênfase (combate / armadilhas / exploração / mista) · semente opcional.

**Pipeline (cada etapa é função pura `(entrada, rng) → saída`, testável):**
1. **Layout:** masmorra = salas + corredores (BSP); caverna = autômato celular; ao ar livre = ruído + clareiras; garante conectividade e ponto de entrada/saída.
2. **Tema:** aplica paleta de tiles, decoração e regras do bioma (ex.: pântano = terreno difícil/água).
3. **Povoamento:** distribui encontros pelo **orçamento de XP** por sala (tabelas de dificuldade da 5e), sorteando monstros por tema/ND do bestiário; um "chefe" na última sala.
4. **Perigos e enigmas:** armadilhas por templates (CD, dano, gatilho por nível) e portas trancadas/secretas.
5. **Recompensa:** tesouro por ND, chaves, itens de história.
6. **Gancho narrativo:** nome, descrição de cada sala e objetivo (templates de texto; IA opcional na Fase 10).
7. **Validação:** conectividade, orçamento total dentro da tolerância, sem sobreposição, dificuldade estimada exibida.

| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| G-1 | Contrato do gerador: `GeneratorParams` → `GeneratedAdventure` (mapa, salas, encontros, loot, gancho) | P0 | M | Tipos + JSON Schema; mesmo formato do editor |
| G-2 | Geração por **semente** e reprodutibilidade | P0 | S | Mesma semente + parâmetros = mesmo resultado (teste) |
| G-3 | Layout de masmorra (BSP salas + corredores) | P0 | L | 100 sementes: 100% conectadas |
| G-4 | Layout de caverna (autômato celular) e ao ar livre (ruído) | P1 | L | Sem áreas isoladas; tamanho respeita o pedido |
| G-5 | Catálogo de temas em dados (JSON): tiles e **texturas**, monstros, armadilhas, nomes | P0 | M | Adicionar tema = adicionar arquivo, sem código |
| G-6 | Povoamento por orçamento de XP + escolha de monstros por tema/ND | P0 | L | Total ≈ alvo de dificuldade (±15%, teste estatístico) |
| G-7 | Armadilhas, portas trancadas/secretas, enigmas por template | P1 | M | CD/dano coerentes com o nível do grupo |
| G-8 | Tesouro e recompensas por ND | P1 | M | Valor total dentro da faixa do nível |
| G-9 | Nome, descrição das salas e gancho da aventura (templates de texto) | P1 | M | Texto varia com tema; sem repetição óbvia |
| G-10 | UI do gerador: formulário, pré-visualização, "gerar de novo" | P0 | M | Resultado em < 1 s para tamanho médio |
| G-11 | **Regenerar parcialmente**: travar salas/encontros que gostou e re-sortear o resto | P1 | M | Itens travados não mudam |
| G-12 | Abrir no Estúdio para edição manual + salvar na biblioteca | P0 | S | Editável como qualquer dungeon |
| G-13 | Compartilhar semente/URL (`?tema=cripta&tam=M&seed=…`) | P2 | S | Link reproduz a mesma dungeon |
| G-14 | Gerar **encontro rápido** avulso (só combate no mapa atual) | P1 | M | Mestre escolhe terreno e recebe encontro posicionado |
| G-15 | Estimador de dificuldade + relatório do gerado (XP, nº de monstros, perigos) | P2 | S | Painel resumo |
| G-16 | Descrições com IA (opt-in, chave do próprio Mestre) | P2 | M | Desligado por padrão |

### Fase 8 — Multiplayer
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F8-1 | Auth (Supabase) + perfil | P0 | M | Login por e-mail/OAuth |
| F8-2 | Esquema Postgres + **RLS**: campanhas, membros, mapas, fichas | P0 | L | Jogador só lê o que pertence à sua campanha (teste de política) |
| F8-3 | Campanhas: criar, convidar por link/código, papéis | P0 | M | Mestre convida; jogador entra |
| F8-4 | Sala em tempo real (Realtime channel) + presença | P0 | M | Vê quem está online |
| F8-5 | Transporte de `Command` (jogador → Mestre) e `Event` (Mestre → todos) com sequência | P0 | L | Ordem garantida; lacuna dispara resync |
| F8-6 | Projeção por jogador enviada pelo Mestre (fog, ocultos, HP inimigo) | P0 | M | Inspecionar tráfego não revela segredo |
| F8-7 | Rolagens públicas/secretas (Mestre pode rolar às escondidas) | P1 | S | Resultado só ao Mestre quando secreto |
| F8-8 | Jogador controla só o próprio personagem (UI limitada por papel) | P0 | M | Botões inválidos desabilitados **e** rejeitados no validador |
| F8-9 | Reações e pedidos ao jogador (salvaguarda, opp. attack) com timeout | P1 | M | Mestre aguarda ou resolve automaticamente |
| F8-10 | Reconexão e retomada (snapshot + eventos) | P0 | M | F5 no meio do combate não perde nada |
| F8-11 | Mestre offline: sala pausa (autoridade é do Mestre) e salva snapshot | P1 | M | Retoma na próxima sessão |
| F8-12 | Fichas de jogador na nuvem; Mestre pode editar/conceder itens, XP, dano | P1 | M | Alterações auditadas no log |
| F8-13 | Chat + sussurros do Mestre | P2 | M | Mensagem privada por jogador |
| F8-14 | Cursor/ping no mapa ("olhem aqui") | P2 | S | Ping visível a todos |
| F8-15 | **Chat de voz** (WebRTC, só áudio, malha P2P): sinalização pelo canal Realtime da sala | P1 | L | 2–6 pessoas conversam; entrar/sair sem recarregar |
| F8-16 | Controles de voz: mudo, push-to-talk ou aberto, escolha de microfone/saída, volume por pessoa | P1 | M | Preferências persistem; permissão de microfone tratada (negada/sem dispositivo) |
| F8-17 | Indicador de quem fala (avatar na sala e pulso no token do personagem) | P2 | S | Visível sem depender só de cor |
| F8-18 | Moderação: Mestre silencia/expulsa da voz; ninguém grava (aviso de privacidade) | P1 | S | Ação do Mestre reflete em todos |
| F8-19 | Servidor TURN para redes restritivas (serviço gerenciado com plano gratuito) | P1 | M | Conecta atrás de NAT simétrico; credenciais temporárias |
| F8-20 | **Rolagens sincronizadas**: evento `RollResolved {valores}` → todos os clientes animam os mesmos dados; rolagem secreta só para o Mestre | P0 | M | Todos veem a mesma face final (teste); nada vaza em rolagem secreta |

### Fase 9 — Polimento e portfólio
| ID | Item | Pri | Est | Critério de aceite |
|---|---|---|---|---|
| F9-1 | Persistência de sessão/encontro + export/import JSON | P0 | M | Recarregar não perde o combate |
| F9-2 | Acessibilidade (WCAG AA: contraste, foco, ARIA, leitor de tela p/ log) | P0 | M | Axe sem violações críticas |
| F9-3 | Responsivo/toque (tablet como mesa) | P1 | M | Usável em 768px |
| F9-4 | PWA offline | P2 | S | Instalável, funciona offline |
| F9-5 | Performance (OnPush/signals, lazy routes, bundle < 300 kB inicial) | P1 | M | Lighthouse ≥ 90 |
| F9-6 | Testes E2E (criar encontro → combater → fim) | P1 | M | Playwright verde no CI |
| F9-7 | README com GIFs, decisões de arquitetura (ADRs), roadmap | P0 | M | Recrutador entende em 2 min |
| F9-8 | i18n pt-BR/en | P2 | M | Troca de idioma em runtime |
| F9-9 | Atalhos de teclado + paleta de comandos | P2 | M | `Ctrl+K` |

### Fase 10 — Stretch
- Importar/exportar formatos VTT (ex.: JSON do Foundry/Roll20 simplificado).
- IA para descrever cenas (além de G-16) / decidir turnos de NPC (opt-in, API externa).
- Voz em malha só escala até ~6–8 pessoas: migrar para SFU (LiveKit) e/ou adicionar vídeo.
- Grid hexagonal; regras da 2024 (SRD 5.2).

## 5. Definição de pronto (por item)

1. Regra nova em `core/rules` **com testes unitários** (casos normais + bordas).
2. Estado imutável; nenhuma regra dentro de componente.
3. Lint e build limpos no CI.
4. Acessível por teclado e com rótulos.
5. Demonstrável no app (não só testado).

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Escopo infinito (D&D é enorme) | Cortar em SRD; congelar escopo após a Fase 6 |
| Regras com muitas exceções | Modelar efeitos como dados (`modifier`, `advantage`) em vez de `if` espalhado |
| Performance do SVG com muitos tokens | Medir cedo; `track` em `@for`, evitar re-render global; canvas só se medido |
| Licença de conteúdo | Somente SRD + atribuição CC-BY-4.0 |
| Trapaça do cliente / vazamento de segredo | Mestre autoritativo, validação por papel, RLS, e projeção filtrada (nunca enviar o oculto) |
| Complexidade de tempo real (ordem, reconexão) | Eventos com sequência + snapshot; um único caminho de mutação (`dispatch`) |
| Geração aleatória sem graça/injusta | Orçamento de XP + validação, catálogos de tema em dados, regeneração parcial e edição manual |
| Voz WebRTC: NAT/firewall e escala | TURN gerenciado (F8-19); malha limitada a ~6 pessoas (mesa de RPG cabe); SFU só se necessário |
| Textura de piso atrapalha ler os tokens | Texturas de baixo contraste, anel/forma por equipe, modo alto contraste (F3-10/F3-11) |
| Dado animado divergir do resultado | Resultado decidido pelo motor antes; animação é apenas apresentação (F1-6, F8-20) |
| Perder motivação sem entrega visível | Cada fase termina com algo demonstrável e um GIF no README |

## 7. Primeiros passos (semana 1)

1. F0-1 → F0-3, F0-5 (projeto + CI)
2. F1-1 → F1-4 (parser de dados + UI) — primeira vitória visível
3. F0-8 + F2-1 (modelos) para destravar o resto
