import { ConflictException, NotFoundException } from '@nestjs/common';
import { DominoService } from './domino.service';

describe('DominoService', () => {
  let service: DominoService;
  const p1 = { playerId: 'p1', displayName: 'Uno' };
  const p2 = { playerId: 'p2', displayName: 'Dos' };
  const p3 = { playerId: 'p3', displayName: 'Tres' };

  beforeEach(() => {
    service = new DominoService();
  });

  afterEach(() => jest.useRealTimers());

  it('crea una mesa con quien la crea sentado y la ven todos', () => {
    const table = service.createTable('1v1', 200000, p1);
    expect(table.maxPlayers).toBe(2);
    expect(table.seats).toEqual([{ index: 0, playerId: 'p1', userId: null, displayName: 'Uno' }]);

    const seenByOther = service.listTables('p2');
    expect(seenByOther.map((t) => t.id)).toEqual([table.id]);
  });

  it('lista la mas nueva primero', () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const first = service.createTable('1v1', 0, p1);
    jest.setSystemTime(2_000);
    const second = service.createTable('2v2', 0, p2);
    expect(service.listTables().map((t) => t.id)).toEqual([second.id, first.id]);
  });

  it('sentarse completa la mesa y la pasa a jugando', () => {
    const table = service.createTable('1v1', 0, p1);
    const joined = service.joinTable(table.id, p2);
    expect(joined.seats.map((s) => s.index)).toEqual([0, 1]);
    expect(joined.status).toBe('playing');
    expect(() => service.joinTable(table.id, p3)).toThrow(ConflictException);
  });

  it('una mesa a la vez: crear o sentarse te levanta de la anterior', () => {
    const a = service.createTable('1v1v1', 0, p1);
    const b = service.createTable('1v1v1', 0, p2);
    service.joinTable(b.id, p1);
    const ids = service.listTables().map((t) => t.id);
    expect(ids).toEqual([b.id]); // la mesa "a" quedo vacia y se borro
    expect(ids).not.toContain(a.id);
  });

  it('levantarse del ultimo asiento borra la mesa', () => {
    const table = service.createTable('1v1', 0, p1);
    service.leaveTable(table.id, 'p1');
    expect(service.listTables()).toEqual([]);
    expect(() => service.joinTable(table.id, p2)).toThrow(NotFoundException);
  });

  it('libera asientos de quien deja de dar senales mientras la mesa espera', () => {
    jest.useFakeTimers().setSystemTime(0);
    const table = service.createTable('1v1v1', 0, p1);
    service.joinTable(table.id, p2);

    jest.setSystemTime(30_000);
    service.listTables('p2'); // p2 sigue en la sala, p1 no

    jest.setSystemTime(50_000);
    const [after] = service.listTables('p2');
    expect(after.seats.map((s) => s.playerId)).toEqual(['p2']);
  });
});
