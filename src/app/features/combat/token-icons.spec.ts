import { tokenImageFor } from './token-icons';

describe('imagem própria do token', () => {
  const creature = { name: 'Heroína', kind: 'pc' as const };

  it('aceita apenas data URLs de imagem locais e limitadas', () => {
    expect(tokenImageFor({ ...creature, tokenImage: 'data:image/webp;base64,AAAA' })).toContain(
      'image/webp',
    );
    expect(tokenImageFor({ ...creature, tokenImage: 'https://example.com/token.png' })).toBeNull();
    expect(
      tokenImageFor({ ...creature, tokenImage: `data:image/png;base64,${'A'.repeat(512 * 1024)}` }),
    ).toBeNull();
  });
});
