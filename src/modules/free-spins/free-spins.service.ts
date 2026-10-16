import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { FreeSpinSession } from './entities/free-spin-session.entity';
import { StartFreeSpinSessionDto } from './dtos/start-free-spin-session.dto';
import { ExtendFreeSpinSessionDto } from './dtos/extend-free-spin-session.dto';
import { ReportFreeSpinProgressDto } from './dtos/report-free-spin-progress.dto';
import { FinishFreeSpinSessionDto } from './dtos/finish-free-spin-session.dto';
import { ResumeFreeSpinSessionDto } from './dtos/resume-free-spin-session.dto';
import { FreeSpinSessionIdentityDto } from './dtos/free-spin-session-identity.dto';
import { ORPHANED_ROUND_TAKEOVER_MS } from '../../common/utils/slot-round-ownership';

export interface FreeSpinSessionSnapshot {
  betAmount: number;
  spinsTotal: number;
  spinsStarted: number;
  spinsRemaining: number;
  accumulatedWinnings: number;
}

@Injectable()
export class FreeSpinsService {
  constructor(
    @InjectRepository(FreeSpinSession)
    private readonly repository: Repository<FreeSpinSession>,
  ) {}

  private toSnapshot(row: FreeSpinSession): FreeSpinSessionSnapshot {
    return {
      betAmount: Number(row.betAmount),
      spinsTotal: row.spinsTotal,
      spinsStarted: row.spinsStarted,
      spinsRemaining: row.spinsRemaining,
      accumulatedWinnings: Number(row.accumulatedWinnings),
    };
  }

  /** Arranca (o reinicia de cero) la ronda de ESTA pestaña. Quien dispara un "start" siempre es la
   *  pestaña que acaba de otorgar la ronda (SCATTER o compra confirmada) - no toca las rondas de
   *  otras pestañas del mismo jugador, que siguen cada una por su lado. */
  async startSession(dto: StartFreeSpinSessionDto): Promise<FreeSpinSessionSnapshot> {
    // Las rondas ya terminadas no sirven para nada (no es un historial): se limpian acá para que
    // la tabla no crezca con una fila por cada pestaña que alguna vez jugó.
    await this.repository.delete({ userId: dto.userId, game: dto.game, status: Not('active') });

    let row = await this.repository.findOne({
      where: { userId: dto.userId, game: dto.game, ownerToken: dto.clientToken },
    });
    if (!row) {
      row = this.repository.create({ userId: dto.userId, game: dto.game, ownerToken: dto.clientToken });
    }

    row.status = 'active';
    row.betAmount = dto.betAmount;
    row.spinsTotal = dto.spinsAwarded;
    row.spinsStarted = 0;
    row.spinsRemaining = dto.spinsAwarded;
    row.accumulatedWinnings = 0;

    await this.repository.save(row);
    return this.toSnapshot(row);
  }

  /** Retrigger dentro de una ronda ya activa: suma tiradas sobre la misma fila. */
  async extendSession(dto: ExtendFreeSpinSessionDto): Promise<FreeSpinSessionSnapshot> {
    const row = await this.loadOwnedActiveSession(dto);

    row.spinsTotal += dto.spinsAwarded;
    row.spinsRemaining += dto.spinsAwarded;

    await this.repository.save(row);
    return this.toSnapshot(row);
  }

  /** Estado absoluto ya calculado por el cliente tras cada tirada (no un delta), igual que
   *  SantaWildsService.setJackpotProgress. Llamado fire-and-forget desde Unity - no bloquea el
   *  loop de tiradas automáticas. */
  async reportProgress(dto: ReportFreeSpinProgressDto): Promise<FreeSpinSessionSnapshot> {
    const row = await this.loadOwnedActiveSession(dto);

    row.spinsTotal = dto.spinsTotal;
    row.spinsStarted = dto.spinsStarted;
    row.spinsRemaining = dto.spinsRemaining;
    row.accumulatedWinnings = dto.accumulatedWinnings;

    await this.repository.save(row);
    return this.toSnapshot(row);
  }

  /** Cierra la ronda normalmente (se acabaron las tiradas gratis). */
  async finishSession(dto: FinishFreeSpinSessionDto): Promise<FreeSpinSessionSnapshot> {
    const row = await this.loadOwnedActiveSession(dto);

    row.status = 'finished';
    row.spinsRemaining = 0;
    row.accumulatedWinnings = dto.accumulatedWinnings;

    await this.repository.save(row);
    return this.toSnapshot(row);
  }

  /** Llamado al cargar el juego. Retoma la ronda de esta pestaña (recargó la página) o una que
   *  otra pestaña dejó abandonada hace más de ORPHANED_ROUND_TAKEOVER_MS - en ese caso la reclama,
   *  y si la pestaña vieja vuelve, sus escrituras chocan con loadOwnedActiveSession (409). Nunca
   *  le saca la ronda a una pestaña que la está jugando. */
  async resumeSession(dto: ResumeFreeSpinSessionDto): Promise<{ active: boolean } & Partial<FreeSpinSessionSnapshot>> {
    const active = await this.repository.find({ where: { userId: dto.userId, game: dto.game, status: 'active' } });

    const own = active.find((row) => row.ownerToken === dto.clientToken);
    if (own) return { active: true, ...this.toSnapshot(own) };

    const now = Date.now();
    const abandoned = active.find(
      (row) => now - new Date(row.updatedAt).getTime() >= ORPHANED_ROUND_TAKEOVER_MS,
    );
    if (!abandoned) return { active: false };

    // Libera el lugar (userId, game, ownerToken) por si esta pestaña tiene una fila vieja propia.
    await this.repository.delete({ userId: dto.userId, game: dto.game, ownerToken: dto.clientToken });
    abandoned.ownerToken = dto.clientToken;
    await this.repository.save(abandoned);

    return { active: true, ...this.toSnapshot(abandoned) };
  }

  /** Centraliza la validación que comparten extend/progress/finish: solo la fila de esta pestaña,
   *  y activa. Si esta pestaña ya no tiene fila (otra pestaña se la retomó por abandonada), 409:
   *  es la señal para que el juego corte la ronda en vez de seguir escribiendo. */
  private async loadOwnedActiveSession(dto: FreeSpinSessionIdentityDto): Promise<FreeSpinSession> {
    const row = await this.repository.findOne({
      where: { userId: dto.userId, game: dto.game, ownerToken: dto.clientToken },
    });
    if (!row) throw new ConflictException('Free-spin session was taken over by another window');
    if (row.status !== 'active') throw new BadRequestException('Free-spin session is not active');
    return row;
  }
}
