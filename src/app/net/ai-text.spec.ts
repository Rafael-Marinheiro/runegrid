import { GeneratedAdventure } from '@core/models/adventure';
import { describe, expect, it, vi } from 'vitest';
import { enhanceAdventureText, suggestSceneText } from './ai-text';

const adventure = {
  name: 'A cripta',
  hook: 'Gancho original',
  params: { theme: 'crypt' },
  rooms: [
    { id: 'a', name: 'Entrada', role: 'entrance', description: 'Original A' },
    { id: 'b', name: 'Câmara', role: 'boss', description: 'Original B' },
  ],
} as GeneratedAdventure;

describe('enhanceAdventureText', () => {
  it('aplica somente textos de IDs conhecidos e nao envia a chave no corpo', async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { store: boolean; input: string };
      expect(body.store).toBe(false);
      expect(String(init?.body)).not.toContain('sk-teste');
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    hook: '  Novo gancho  ',
                    rooms: [
                      { id: 'a', description: 'Nova entrada' },
                      { id: 'estranha', description: 'Ignorar' },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await enhanceAdventureText(adventure, 'sk-teste', 'pt-BR', request);

    expect(result.hook).toBe('Novo gancho');
    expect(result.rooms.map((room) => room.description)).toEqual(['Nova entrada', 'Original B']);
    expect(result.params).toBe(adventure.params);
    expect(request).toHaveBeenCalledOnce();
  });

  it('gera sugestão consultiva de cena sem enviar a chave no corpo', async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { store: boolean; input: string };
      expect(body.store).toBe(false);
      expect(body.input).toContain('Guarda');
      expect(String(init?.body)).not.toContain('sk-secreta');
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    scene: '  A chama vacila. ',
                    npcIntention: ' O guarda busca uma saída. ',
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    await expect(
      suggestSceneText(
        {
          encounter: 'Cripta',
          npc: { name: 'Guarda', kind: 'npc', status: 'alive', conditions: [] },
        },
        'sk-secreta',
        'pt-BR',
        request,
      ),
    ).resolves.toEqual({ scene: 'A chama vacila.', npcIntention: 'O guarda busca uma saída.' });
  });
});
