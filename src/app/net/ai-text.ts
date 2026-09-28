import { GeneratedAdventure } from '@core/models/adventure';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

interface ResponsesPayload {
  output?: { content?: { type?: string; text?: string }[] }[];
  error?: { message?: string };
}

interface AdventureText {
  hook: string;
  rooms: { id: string; description: string }[];
}

export async function enhanceAdventureText(
  adventure: GeneratedAdventure,
  apiKey: string,
  locale: 'pt-BR' | 'en',
  request: typeof fetch = fetch,
): Promise<GeneratedAdventure> {
  const response = await request(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      store: false,
      instructions:
        locale === 'en'
          ? 'Rewrite only the narrative text for a D&D 5e adventure in English. Keep every room id. Use vivid but concise descriptions of at most two sentences and do not add game rules.'
          : 'Reescreva apenas o texto narrativo de uma aventura de D&D 5e em pt-BR. Mantenha todos os IDs de sala. Use descrições vívidas e concisas, com no máximo duas frases, sem acrescentar regras de jogo.',
      input: JSON.stringify({
        name: adventure.name,
        theme: adventure.params.theme,
        hook: adventure.hook,
        rooms: adventure.rooms.map(({ id, name, role, description }) => ({
          id,
          name,
          role,
          description,
        })),
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'adventure_text',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              hook: { type: 'string' },
              rooms: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' }, description: { type: 'string' } },
                  required: ['id', 'description'],
                  additionalProperties: false,
                },
              },
            },
            required: ['hook', 'rooms'],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const payload = (await response.json()) as ResponsesPayload;
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI HTTP ${response.status}`);

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text')?.text;
  if (!text) throw new Error('A API não retornou texto.');

  const generated = JSON.parse(text) as Partial<AdventureText>;
  if (typeof generated.hook !== 'string' || !Array.isArray(generated.rooms))
    throw new Error('A API retornou um formato inesperado.');

  const descriptions = new Map(
    generated.rooms
      .filter(
        (room): room is { id: string; description: string } =>
          typeof room?.id === 'string' && typeof room.description === 'string',
      )
      .map((room) => [room.id, room.description.trim()]),
  );
  const hook = generated.hook.trim();
  return {
    ...adventure,
    hook: hook || adventure.hook,
    rooms: adventure.rooms.map((room) => ({
      ...room,
      description: descriptions.get(room.id) || room.description,
    })),
  };
}
