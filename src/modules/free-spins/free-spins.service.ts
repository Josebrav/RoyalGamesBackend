import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreeSpinSession } from './entities/free-spin-session.entity';
import { StartFreeSpinSessionDto } from './dtos/start-free-spin-session.dto';
import { ExtendFreeSpinSessionDto } from './dtos/extend-free-spin-session.dto';
import { ReportFreeSpinProgressDto } from './dtos/report-free-spin-progress.dto';
import { FinishFreeSpinSessionDto } from './dtos/finish-free-spin-session.dto';
import { ResumeFreeSpinSessionDto } from './dtos/resume-free-spin-session.dto';
import { FreeSpinSessionIdentityDto } from './dtos/free-spin-session-identity.dto';

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

  /** Arranca (o reinicia de cero) la ronda de este (userId, game) y la reclama para
   *  dto.clientToken. Quien dispara un "start" siempre es la ventana que acaba de otorgar la
   *  ronda (SCATTER o compra confirmada), así que no hay nada que arbitrar acá - a diferencia de
   *  extend/progress/finish, no exige que ningún token previo coincida. */
  async startSession(dto: StartFreeSpinSessionDto): Promise<FreeSpinSessionSnapshot> {
    let row = await this.repository.findOne({ where: { userId: dto.userId, game: dto.game } });

    if (!row) {
      row = this.repository.create({ userId: dto.userId, game: dto.game });
    }

    row.status = 'active';
    row.betAmount = dto.betAmount;
    row.spinsTotal = dto.spinsAwarded;
    row.spinsStarted = 0;
    row.spinsRemaining = dto.spinsAwarded;
    row.accumulatedWinnings = 0;
    row.ownerToken = dto.clientToken;

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

  /** Llamado al cargar el juego. Si hay una ronda activa para este (userId, game), ESTA llamada
   *  es el evento de takeover: reclama la fila para dto.clientToken sin importar quién la tenía
   *  -reconectar/recargar siempre gana-, dejando que cualquier escritura posterior de la ventana
   *  vieja choque con loadOwnedActiveSession y se rechace. */
  async resumeSession(dto: ResumeFreeSpinSessionDto): Promise<{ active: boolean } & Partial<FreeSpinSessionSnapshot>> {
    const row = await this.repository.findOne({ where: { userId: dto.userId, game: dto.game } });
    if (!row || row.status !== 'active') return { active: false };

    row.ownerToken = dto.clientToken;
    await this.repository.save(row);

    return { active: true, ...this.toSnapshot(row) };
  }

  /** Centraliza la validación que comparten extend/progress/finish: la fila tiene que existir,
   *  estar activa, y pertenecerle a quien llama (mismo clientToken que la reclamó última vez) -
   *  si no, 404/400/409 según cuál de las tres cosas falló. El 409 es la pieza clave del
   *  anti-duplicado: una ventana vieja que una más nueva ya le tomó el control deja de poder
   *  escribir acá apenas intenta su próxima tirada. */
  private async loadOwnedActiveSession(dto: FreeSpinSessionIdentityDto): Promise<FreeSpinSession> {
    const row = await this.repository.findOne({ where: { userId: dto.userId, game: dto.game } });
    if (!row) throw new NotFoundException('No free-spin session found for this user/game');
    if (row.status !== 'active') throw new BadRequestException('Free-spin session is not active');
    if (row.ownerToken !== dto.clientToken) {
      throw new ConflictException('Free-spin session was taken over by another window');
    }
    return row;
  }
}
