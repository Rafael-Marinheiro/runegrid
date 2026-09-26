import { newEncounter } from '@core/rules/encounter';
import { mapFromAscii } from '@core/models/grid';
import {
  isValidCode,
  normalizeCode,
  Outbox,
  parseClientMsg,
  peerIdFor,
  randomCode,
} from './protocol';

describe('código da sala', () => {
  it('tem 6 caracteres sem letras ambíguas e normaliza a digitação', () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCode();
      expect(c).toHaveLength(6);
      expect(/[01OIL]/.test(c)).toBe(false);
      expect(isValidCode(c)).toBe(true);
    }
    expect(normalizeCode(' ab-c2 3xy ')).toBe('ABC23XY');
    expect(peerIdFor('abc234')).toBe('runegrid-ABC234');
    expect(isValidCode('ABC12')).toBe(false);
    expect(isValidCode('ABC1O2')).toBe(false);
  });
});

describe('validação das mensagens do jogador', () => {
  it('aceita comandos de turno e recusa comandos de Mestre', () => {
    const move = { t: 'cmd', id: 1, cmd: { type: 'move', actorId: 'a', to: { x: 1, y: 1 } } };
    expect(parseClientMsg(move)).toEqual(move);
    for (const type of [
      'startCombat',
      'damage',
      'addCreature',
      'paint',
      'setMap',
      'placeToken',
      'joinCombat',
    ]) {
      expect(parseClientMsg({ t: 'cmd', id: 2, cmd: { type } }), type).toBeNull();
    }
  });

  it('recusa formas inválidas', () => {
    expect(parseClientMsg(null)).toBeNull();
    expect(parseClientMsg('texto')).toBeNull();
    expect(parseClientMsg({ t: 'cmd', id: 'x', cmd: { type: 'move' } })).toBeNull();
    expect(parseClientMsg({ t: 'cmd', id: 1 })).toBeNull();
    expect(parseClientMsg({ t: 'cmd', id: 1, cmd: { type: 42 } })).toBeNull();
    expect(parseClientMsg({ t: 'desconhecida' })).toBeNull();
  });

  it('hello e chat: limpa espaços e limita o tamanho', () => {
    expect(parseClientMsg({ t: 'hello', name: '  Ana  ' })).toEqual({ t: 'hello', name: 'Ana' });
    expect(parseClientMsg({ t: 'hello', name: '   ' })).toBeNull();
    expect(
      (parseClientMsg({ t: 'hello', name: 'x'.repeat(100) }) as { name: string }).name,
    ).toHaveLength(24);
    expect(parseClientMsg({ t: 'chat', text: '  oi  ' })).toEqual({
      t: 'chat',
      text: 'oi',
      to: undefined,
    });
    expect(parseClientMsg({ t: 'chat', text: '   ' })).toBeNull();
    expect(
      (parseClientMsg({ t: 'chat', text: 'y'.repeat(9999) }) as { text: string }).text,
    ).toHaveLength(500);
  });
});

describe('Outbox', () => {
  const state = () => newEncounter(mapFromAscii(['...', '...']));

  it('envia o mapa na primeira vez e só quando muda', () => {
    const box = new Outbox();
    const s = state();
    expect(box.messagesFor('p1', s).map((m) => m.t)).toEqual(['map', 'state']);
    expect(box.messagesFor('p1', s).map((m) => m.t)).toEqual(['state']);
    const other = { ...s, map: mapFromAscii(['.#.', '...']) };
    expect(box.messagesFor('p1', other).map((m) => m.t)).toEqual(['map', 'state']);
  });

  it('cada jogador tem o seu controle; esquecer força reenviar', () => {
    const box = new Outbox();
    const s = state();
    box.messagesFor('p1', s);
    expect(box.messagesFor('p2', s).map((m) => m.t)).toEqual(['map', 'state']);
    box.forget('p1');
    expect(box.messagesFor('p1', s).map((m) => m.t)).toEqual(['map', 'state']);
  });

  it('o estado enviado não carrega o mapa', () => {
    const [, msg] = new Outbox().messagesFor('p', state());
    expect(msg.t === 'state' && 'map' in msg.state).toBe(false);
  });
});

describe('ping', () => {
  it('aceita coordenadas inteiras e rejeita o resto', () => {
    expect(parseClientMsg({ t: 'ping', pos: { x: 2, y: 3 } })).toEqual({
      t: 'ping',
      pos: { x: 2, y: 3 },
    });
    expect(parseClientMsg({ t: 'ping', pos: { x: 'a', y: 3 } })).toBeNull();
    expect(parseClientMsg({ t: 'ping', pos: { x: 1.5, y: 3 } })).toBeNull();
    expect(parseClientMsg({ t: 'ping' })).toBeNull();
  });
});
