import { Controller, Get, Post, Put, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SantaWildsService } from './santawilds.service';
import { SantaWildsSlotService } from './santawilds-slot.service';
import { SetJackpotProgressDto } from './dtos/set-jackpot-progress.dto';
import { SetLastBetDto } from './dtos/set-last-bet.dto';
import { SpinDto } from './dtos/spin.dto';

// Sin guard, igual que ChipsController/GemasOfGoldController: el cliente es el build WebGL
// embebido en un iframe, sin JWT, que solo conoce el jugadorID (ver ChipManager.cs /
// ResolveJugadorId). La parte sensible (quién gana, cuánto) no depende de esta confianza: el
// resultado de cada tirada de /spin lo decide siempre SantaWildsSlotService server-side, nunca el
// cliente - eso es lo que evita que el cliente pueda dictar su propio resultado.
@ApiTags('SantaWilds')
@Controller('santawilds')
export class SantaWildsController {
  constructor(
    private readonly santaWildsService: SantaWildsService,
    private readonly santaWildsSlotService: SantaWildsSlotService,
  ) {}

  // Punto único de tirada: si el jugador tiene un bono en curso, esto lo continúa (betAmount se
  // ignora); si no, es una tirada base nueva y requiere betAmount. Reemplaza, para esta slot,
  // a remove/chips + add/chips + jackpot-progress + free-spin-sessions/* (ver
  // SantaWildsSlotService.spin). Mismo límite ampliado que esos endpoints tenían, por la misma
  // razón (modo turbo).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Post('spin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve one base spin or one bonus free-spin for this player (server-authoritative)' })
  spin(@Body() dto: SpinDto) {
    return this.santaWildsSlotService.spin(dto.jugadorId, dto.betAmount);
  }

  // Límite propio más alto que el default global (100/60s): a diferencia de los otros slots,
  // SantaWilds persiste el contador de JACKPOT en el server en CADA tirada (ver
  // JackpotCounter.HandleJackpotSymbols/ChipManager.SaveJackpotProgress), no solo cuando hay
  // bono. Con el modo turbo eso es una segunda tirada rápida de requests además de
  // remove/chips, y el límite global compartido se agotaba enseguida (igual razón que
  // add/chips y remove/chips en ChipsController).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get('jackpot-progress/:userId')
  @ApiOperation({ summary: 'Progreso del contador de JACKPOT por precio de apuesta, para este jugador' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Lista de { betAmount, progress }' })
  getJackpotProgress(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.santaWildsService.getJackpotProgress(userId);
  }

  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Put('jackpot-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guarda el progreso del contador de JACKPOT para un precio de apuesta puntual' })
  @ApiResponse({ status: 200, description: 'Progreso guardado' })
  setJackpotProgress(@Body() dto: SetJackpotProgressDto) {
    return this.santaWildsService.setJackpotProgress(dto);
  }

  // Última apuesta elegida por el jugador. El cliente solo la pide una vez al cargar (y la
  // guarda una vez por cambio de apuesta), nada que ver con el volumen de remove/chips - no
  // necesita el límite ampliado de arriba.
  @Get('last-bet/:userId')
  @ApiOperation({ summary: 'Última apuesta elegida por este jugador (null si nunca jugó)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: '{ betAmount } o null' })
  getLastBet(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.santaWildsService.getLastBet(userId);
  }

  @Put('last-bet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guarda la última apuesta elegida por el jugador' })
  @ApiResponse({ status: 200, description: 'Apuesta guardada' })
  setLastBet(@Body() dto: SetLastBetDto) {
    return this.santaWildsService.setLastBet(dto);
  }
}
