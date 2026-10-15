import { Controller, Get, Put, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SantaWildsService } from './santawilds.service';
import { SetJackpotProgressDto } from './dtos/set-jackpot-progress.dto';

// Sin guard, igual que ChipsController: el cliente es el build WebGL embebido en un iframe, sin
// JWT, que solo conoce el jugadorID (ver ChipManager.cs / ResolveJugadorId).
@ApiTags('SantaWilds')
@Controller('santawilds')
export class SantaWildsController {
  constructor(private readonly santaWildsService: SantaWildsService) {}

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
}
