import { Injectable } from '@nestjs/common';
import type WebSocket from 'ws';
import { WsEnvelope } from './ws-message.types';

interface ConnectionMeta {
  roomId: string;
  playerId: string;
  /** Captured once at connection time (see BingoGateway.extractClientIp) - used by the "guess the
   *  first number" mini-game to block a second guess from the same IP in the same round. */
  ipAddress: string | null;
}

@Injectable()
export class BingoConnectionRegistry {
  private readonly roomSockets = new Map<string, Set<WebSocket>>();
  private readonly socketMeta = new Map<WebSocket, ConnectionMeta>();
  // Bots no tienen un socket real (BingoBotService los juega llamando a BingoService directo, sin
  // pasar por el gateway) — BingoBotService mantiene esto al día en cada tick para que igual
  // aparezcan en la fila de jugadores/presencia de su sala, como si fueran una conexión más.
  private readonly roomBotPlayerIds = new Map<string, Set<string>>();

  register(client: WebSocket, roomId: string, playerId: string, ipAddress: string | null = null): void {
    if (!this.roomSockets.has(roomId)) {
      this.roomSockets.set(roomId, new Set());
    }
    this.roomSockets.get(roomId)!.add(client);
    this.socketMeta.set(client, { roomId, playerId, ipAddress });
  }

  unregister(client: WebSocket): void {
    const meta = this.socketMeta.get(client);
    if (!meta) {
      return;
    }
    const sockets = this.roomSockets.get(meta.roomId);
    sockets?.delete(client);
    if (sockets && sockets.size === 0) {
      this.roomSockets.delete(meta.roomId);
    }
    this.socketMeta.delete(client);
  }

  getMeta(client: WebSocket): ConnectionMeta | undefined {
    return this.socketMeta.get(client);
  }

  /** Includes active bots (see setRoomBots) — this is what the room list's "24/100" badge reads,
   *  and a bot-populated room should look just as occupied there as inside the room itself. */
  getRoomConnectionCount(roomId: string): number {
    return this.getRoomPlayerIds(roomId).length;
  }

  /** Called by BingoBotService every tick with the currently-active bots for a room (empty array
   *  clears it) — the source of truth for "which bots to show as present" always lives there, this
   *  is just where BingoGateway.buildPresence goes to read it. */
  setRoomBots(roomId: string, botPlayerIds: string[]): void {
    if (botPlayerIds.length === 0) {
      this.roomBotPlayerIds.delete(roomId);
      return;
    }
    this.roomBotPlayerIds.set(roomId, new Set(botPlayerIds));
  }

  /** Distinct players currently "in" a room — real sockets plus any active bots (see setRoomBots),
   *  since bots never open a real one but still need to show up in the room's presence list. */
  getRoomPlayerIds(roomId: string): string[] {
    const ids = new Set<string>();
    const sockets = this.roomSockets.get(roomId);
    if (sockets) {
      for (const socket of sockets) {
        const meta = this.socketMeta.get(socket);
        if (meta) {
          ids.add(meta.playerId);
        }
      }
    }
    for (const botId of this.roomBotPlayerIds.get(roomId) ?? []) {
      ids.add(botId);
    }
    return Array.from(ids);
  }

  sendTo(client: WebSocket, envelope: WsEnvelope): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(envelope));
    }
  }

  /** Targets every open socket a specific player has in a room (usually one, but nothing stops
   *  the same account from being connected twice) - used for pushes that only that player cares
   *  about, ej. "you just received gifted-card credits", instead of a full room broadcast. */
  sendToPlayer(roomId: string, playerId: string, envelope: WsEnvelope): void {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) {
      return;
    }
    const message = JSON.stringify(envelope);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN && this.socketMeta.get(socket)?.playerId === playerId) {
        socket.send(message);
      }
    }
  }

  /** Closes every open socket a specific player has in a room right now - used by the "expulsar
   *  de la sala" moderation action (see BingoGateway.handleModeratePlayer). The player's own
   *  handleDisconnect fires normally from this (unregister + broadcastRoomState), same as if they
   *  had closed the tab themselves. Re-joining is blocked separately, at handleConnection, by
   *  BingoService.isPlayerBanned - closing the socket here only ends the CURRENT session. */
  disconnectPlayer(roomId: string, playerId: string, code: number, reason: string): void {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      if (this.socketMeta.get(socket)?.playerId === playerId) {
        socket.close(code, reason);
      }
    }
  }

  broadcastToRoom(roomId: string, envelope: WsEnvelope, exclude?: WebSocket): void {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets) {
      return;
    }
    const message = JSON.stringify(envelope);
    for (const socket of sockets) {
      if (socket !== exclude && socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }
}
