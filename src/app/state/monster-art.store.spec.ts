import { TestBed } from '@angular/core/testing';
import { MonsterArtStore } from './monster-art.store';

describe('MonsterArtStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('monta a URL a partir do índice; sem entrada, devolve null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ aboleth: 'miniaturas/aboleth.png' }))),
    );
    const store = TestBed.inject(MonsterArtStore);
    expect(store.urlFor('aboleth')).toBeNull(); // ainda não carregou
    await store.load();
    expect(store.urlFor('aboleth')).toBe('data/miniaturas/aboleth.png');
    expect(store.urlFor('nao-existe')).toBeNull();
  });

  it('falha de rede não quebra: urlFor segue devolvendo null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    const store = TestBed.inject(MonsterArtStore);
    await store.load();
    expect(store.urlFor('aboleth')).toBeNull();
  });
});
