import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FreeSpinsService } from './free-spins.service';
import { StartFreeSpinSessionDto } from './dtos/start-free-spin-session.dto';
import { ExtendFreeSpinSessionDto } from './dtos/extend-free-spin-session.dto';
import { ReportFreeSpinProgressDto } from './dtos/report-free-spin-progress.dto';
import { FinishFreeSpinSessionDto } from './dtos/finish-free-spin-session.dto';
import { ResumeFreeSpinSessionDto } from './dtos/resume-free-spin-session.dto';

// Sin guard, igual que SantaWildsController/ChipsController: el cliente es el build WebGL
// embebido, sin JWT, que solo conoce el jugadorID (+ game + clientToken para este módulo).
// Genérico por diseño: cualquier juego con tiradas gratis (SantaWilds, RoyalJoker, etc.) puede
// reusar estos mismos endpoints con su propio slug de `game`.
@ApiTags('FreeSpins')
@Controller('free-spin-sessions')
export class FreeSpinsController {
  constructor(private readonly freeSpinsService: FreeSpinsService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arranca (o reinicia) la ronda de tiradas gratis y la reclama para esta ventana' })
  @ApiResponse({ status: 200, description: 'Estado inicial de la ronda' })
  start(@Body() dto: StartFreeSpinSessionDto) {
    return this.freeSpinsService.startSession(dto);
  }

  @Post('extend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suma tiradas a una ronda activa (retrigger)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 409, description: 'La ronda fue tomada por otra ventana' })
  extend(@Body() dto: ExtendFreeSpinSessionDto) {
    return this.freeSpinsService.extendSession(dto);
  }

  // Límite propio más alto que el default global (100/60s): esto se llama en cada tirada del
  // bono, y con el modo turbo de los slots (varios giros por segundo) se agotaba el límite
  // compartido con el resto de los endpoints (ver chips.controller.ts).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Post('progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guarda el progreso absoluto de la ronda tras cada tirada' })
  @ApiResponse({ status: 200, description: 'Estado guardado' })
  @ApiResponse({ status: 409, description: 'La ronda fue tomada por otra ventana' })
  progress(@Body() dto: ReportFreeSpinProgressDto) {
    return this.freeSpinsService.reportProgress(dto);
  }

  @Post('finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la ronda (se acabaron las tiradas gratis)' })
  @ApiResponse({ status: 200, description: 'Ronda cerrada' })
  @ApiResponse({ status: 409, description: 'La ronda fue tomada por otra ventana' })
  finish(@Body() dto: FinishFreeSpinSessionDto) {
    return this.freeSpinsService.finishSession(dto);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Busca una ronda activa para retomar al cargar el juego; si existe, la reclama para esta ventana' })
  @ApiResponse({ status: 200, description: '{ active: false } si no hay ronda, o { active: true, ...estado }' })
  resume(@Body() dto: ResumeFreeSpinSessionDto) {
    return this.freeSpinsService.resumeSession(dto);
  }
}
