import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PLAYBOOK } from './instructions';
import { registerCampaign } from './tools/campaign';
import { registerCharacters } from './tools/characters';
import { registerCombat } from './tools/combat';
import { registerNotes } from './tools/notes';
import { registerReference } from './tools/reference';
import { registerScene } from './tools/scene';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'runegrid-mcp-server', version: '0.1.0' },
    { instructions: PLAYBOOK },
  );
  registerCampaign(server);
  registerNotes(server);
  registerCharacters(server);
  registerReference(server);
  registerScene(server);
  registerCombat(server);
  server.registerPrompt(
    'game_master',
    {
      title: 'Run a D&D game',
      description:
        'Start or continue a campaign with the LLM as Game Master, using the vault as memory.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${PLAYBOOK}\n\nBegin now: call rg_campaign_list and continue an existing campaign or set up a new one with me.`,
          },
        },
      ],
    }),
  );
  return server;
}
