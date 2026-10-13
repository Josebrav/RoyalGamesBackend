import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DominoMode, DominoPlayerDto } from './dtos/domino-table.dto';

export interface DominoSeat {
  index: number;
  playerId: string;
  userId: string | null;
  displayName: string;
  /** Ultima vez (ms) que este jugador dio senales (listar mesas, crear, sentarse). */
  lastSeen: number;
}

export interface DominoTable {
  id: string;
  name: string;
  mode: DominoMode;
  maxPlayers: number;
  betAmount: number;
  createdAt: number;
  /** 'waiting' mientras faltan jugadores; 'playing' en cuanto se completa. */
  status: 'waiting' | 'playing';
  seats: DominoSeat[];
}

const PLAYERS_BY_MODE: Record<DominoMode, number> = {
  '1v1': 2,
  '1v1v1': 3,
  '1v1v1v1': 4,
  '2v2': 4,
};

/** Un asiento de una mesa en espera se libera si su jugador no da senales en este tiempo
 *  (cerro la pestana, se cayo la conexion, etc.). La sala pide la lista cada pocos segundos. */
const WAITING_SEAT_TIMEOUT_MS = 45_000;
/** Una mesa ya completa (jugando) se borra pasado este tiempo, por las dudas de que nadie la cierre. */
const PLAYING_TABLE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Mesas de Domino: viven en memoria (son efimeras - existen mientras haya gente sentada), asi
 * todos los jugadores ven las mismas. Todavia no hay partida server-side: esto solo resuelve
 * crear / listar / sentarse / levantarse; la sala del cliente refresca la lista cada pocos
 * segundos y entra a jugar cuando su mesa se completa.
 */
@Injectable()
export class DominoService {
  private readonly tables = new Map<string, DominoTable>();
  private nextNumber = 1;

  listTables(heartbeatPlayerId?: string): DominoTable[] {
    const now = Date.now();
    if (heartbeatPlayerId) {
      this.touch(heartbeatPlayerId, now);
    }
    this.prune(now);
    return [...this.tables.values()].sort((a, b) => b.createdAt - a.createdAt).map((t) => this.toPublic(t));
  }

  createTable(mode: DominoMode, betAmount: number, player: DominoPlayerDto): DominoTable {
    const now = Date.now();
    this.prune(now);
    this.leaveAll(player.playerId);

    const table: DominoTable = {
      id: randomUUID(),
      name: `Mesa ${this.nextNumber++}`,
      mode,
      maxPlayers: PLAYERS_BY_MODE[mode],
      betAmount,
      createdAt: now,
      status: 'waiting',
      seats: [this.seat(0, player, now)],
    };
    this.tables.set(table.id, table);
    return this.toPublic(table);
  }

  joinTable(tableId: string, player: DominoPlayerDto): DominoTable {
    const now = Date.now();
    this.prune(now);

    const table = this.tables.get(tableId);
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }

    const already = table.seats.find((s) => s.playerId === player.playerId);
    if (already) {
      already.lastSeen = now;
      return this.toPublic(table);
    }

    if (table.seats.length >= table.maxPlayers) {
      throw new ConflictException('La mesa esta completa');
    }

    // Una mesa a la vez: sentarse aca te levanta de cualquier otra.
    this.leaveAll(player.playerId);

    const used = new Set(table.seats.map((s) => s.index));
    let index = 0;
    while (used.has(index)) index++;
    table.seats.push(this.seat(index, player, now));
    table.seats.sort((a, b) => a.index - b.index);

    if (table.seats.length >= table.maxPlayers) {
      table.status = 'playing';
    }
    return this.toPublic(table);
  }

  leaveTable(tableId: string, playerId: string): void {
    const table = this.tables.get(tableId);
    if (!table) {
      return;
    }
    table.seats = table.seats.filter((s) => s.playerId !== playerId);
    if (table.seats.length === 0) {
      this.tables.delete(tableId);
    }
  }

  private leaveAll(playerId: string): void {
    for (const table of [...this.tables.values()]) {
      this.leaveTable(table.id, playerId);
    }
  }

  private touch(playerId: string, now: number): void {
    for (const table of this.tables.values()) {
      for (const seat of table.seats) {
        if (seat.playerId === playerId) {
          seat.lastSeen = now;
        }
      }
    }
  }

  private prune(now: number): void {
    for (const table of [...this.tables.values()]) {
      if (table.status === 'playing') {
        if (now - table.createdAt > PLAYING_TABLE_TTL_MS) {
          this.tables.delete(table.id);
        }
        continue;
      }

      table.seats = table.seats.filter((s) => now - s.lastSeen <= WAITING_SEAT_TIMEOUT_MS);
      if (table.seats.length === 0) {
        this.tables.delete(table.id);
      }
    }
  }

  private seat(index: number, player: DominoPlayerDto, now: number): DominoSeat {
    return {
      index,
      playerId: player.playerId,
      userId: player.userId ?? null,
      displayName: (player.displayName || 'Jugador').slice(0, 40),
      lastSeen: now,
    };
  }

  /** Lo que ve el cliente (sin lastSeen). */
  private toPublic(table: DominoTable): DominoTable {
    return {
      ...table,
      seats: table.seats.map(({ lastSeen, ...rest }) => rest as DominoSeat),
    };
  }
}
