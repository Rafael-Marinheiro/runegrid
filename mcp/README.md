# runegrid-mcp-server — um Mestre de IA para o RuneGrid

Servidor [MCP](https://modelcontextprotocol.io) que deixa uma LLM **conduzir uma campanha completa de D&D 5e**: ela narra e decide, o **motor de regras do app** (`src/app/core/rules`, o mesmo do combate, do gerador e do bestiário) arbitra a mecânica, e um **cofre do Obsidian** guarda tudo — história, turnos, NPCs, locais, missões, combates, segredos — como memória permanente entre conversas.

```
LLM (Claude, etc.) ──MCP/stdio──▶ runegrid-mcp-server ──▶ motor de regras do app (TS puro, empacotado)
                                          │
                                          └──▶ Cofre Obsidian: Markdown + .runegrid/state.json
```

A LLM esquece tudo entre conversas; o cofre não. Ao começar, ela chama `rg_campaign_resume` e recebe o resumo da última sessão, os ganchos abertos, o diário recente, as notas que já existem e o estado do grupo.

## Instalar

```bash
cd mcp
npm install
npm run build        # gera dist/index.js (um arquivo só: servidor + motor + dados SRD)
```

Defina onde fica o cofre com `RUNEGRID_VAULT` (padrão: `~/RuneGrid-Vault`). Abra essa pasta no Obsidian (**Abrir pasta como cofre**). Cada campanha é uma subpasta.

**Claude Code**

```bash
claude mcp add runegrid -e RUNEGRID_VAULT="C:\Users\voce\Obsidian\RuneGrid" -- node "C:\Projetos\Projeto Angular\mcp\dist\index.js"
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "runegrid": {
      "command": "node",
      "args": ["C:\\Projetos\\Projeto Angular\\mcp\\dist\\index.js"],
      "env": { "RUNEGRID_VAULT": "C:\\Users\\voce\\Obsidian\\RuneGrid" }
    }
  }
}
```

## Jogar

Peça: _"Seja meu Mestre: crie uma campanha de fantasia sombria e me deixe criar meu personagem"_, ou, numa campanha existente, _"continue a campanha"_. O servidor já envia o manual do Mestre (`instructions`) e expõe o prompt `game_master`.

Ciclo de uma sessão: `rg_campaign_resume` → `rg_session_start` → (narrar → `rg_journal_add` → perguntar ao jogador → rolar/resolver) → `rg_session_end`.

## Ferramentas (29)

| Grupo               | Ferramentas                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campanha            | `rg_campaign_create` · `rg_campaign_list` · `rg_campaign_resume` · `rg_game_status` · `rg_session_start` · `rg_session_end` · `rg_party_update` (ouro, XP, local, hora)                                                 |
| História (Obsidian) | `rg_journal_add` · `rg_note_write` (npc, local, missão, item, lore, handout, segredo) · `rg_note_read` · `rg_note_search`                                                                                               |
| Personagens         | `rg_character_create` (equipamento → CA e ataques pelo motor) · `rg_character_get` · `rg_character_update` · `rg_character_rest`                                                                                        |
| Dados e regras      | `rg_roll` · `rg_check` (teste/salvaguarda com modificadores reais e condições) · `rg_srd_search` · `rg_srd_get` (monstros, magias, itens; 2014 e 2024)                                                                  |
| Mundo               | `rg_adventure_generate` · `rg_adventure_start` · `rg_scene_new` (mapa ASCII desenhado pela LLM) · `rg_scene_switch` · `rg_scene_add_monsters` · `rg_scene_view` (mapa DM/jogador) · `rg_scene_export` (abre no app web) |
| Combate             | `rg_combat_start` · `rg_combat_act` (turno inteiro em lote: mover, atacar, conjurar…) · `rg_dm_command` (dano, condições, névoa, salas, portas…)                                                                        |

O motor valida tudo (vez, alcance, economia de ação, deslocamento, ataques de oportunidade, cobertura, vantagem/desvantagem, concentração, salvaguardas contra a morte). A LLM refere-se a criaturas **por nome** ("Thordak", "Goblin 2") e recebe erros que dizem como corrigir.

## O cofre

```
<Campanha>/
  00 - Painel.md            gerado: grupo, cena, missões ativas, sessões
  Sessões/Sessão 001 - …    diário (história) + registro mecânico da sessão
  Combates/Combate 001 - …  log turno a turno + resultado/XP
  Personagens/<Nome>.md     gerado (bloco da ficha) + "História" escrita à mão
  NPCs/ Locais/ Missões/ Itens/ Lore/ Handouts/ Notas/   notas da LLM, ligadas por [[wikilinks]]
  Mestre/                   SPOILERS: segredos, aventuras geradas, rolagens e eventos ocultos
  .runegrid/state.json      estado do motor (oculto no Obsidian; fonte da verdade)
```

- Frontmatter em propriedades do Obsidian (`tipo`, `status`, `tags`…), compatível com Dataview.
- O que o motor escreve (painel, bloco da ficha) é regenerado; o que você escreve em volta, é preservado.
- **Jogadores: não abram `Mestre/`.** Combates e sessões só registram o que os jogadores veem; eventos de criaturas ocultas vão para `Mestre/Registro secreto.md`.

## Decisões e limites

- Uma campanha ativa por processo (lembrada no cofre e restaurada ao reiniciar).
- O motor automatiza ataques, 14 magias (`rg_srd_get` indica quais) e as condições. Traços de monstro (Tática de Matilha, sopro, ações lendárias) e as demais magias a LLM resolve com `rg_dm_command`/`rg_check`; XP de combate é automático, mas a **subida de nível** é manual (`rg_character_update`).
- Cenas em grid único por vez; `rg_scene_new`/`rg_adventure_start` guardam a anterior (`rg_scene_switch` volta a ela).
- Não conecta à sala P2P do app ao vivo: use `rg_scene_export` e, na tela de Combate do app, **Importar sessão** para **ver** o mapa (formato validado com o `parseSession` do app).
- Um cliente por campanha: dois clientes MCP abertos na mesma campanha sobrescrevem o estado um do outro.
- Sem desfazer; o estado inteiro é regravado a cada mutação (simples e suficiente; ver `ponytail:` em `src/campaign.ts`).

## Desenvolvimento

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: cenário completo via cliente MCP + casos de regra + vault
npm run build
```

`evaluation.xml` traz 10 perguntas somente-leitura sobre o SRD/catálogo para avaliar se uma LLM consegue usar as ferramentas de consulta.
