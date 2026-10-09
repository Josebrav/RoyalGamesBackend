import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GemasOfGoldService } from './gemasofgold.service';
import { GemasOfGoldSlotService } from './gemasofgold-slot.service';
import { SpinDto } from './dtos/spin.dto';

// Sin guard, mismo criterio que games/mines y santawilds: lo consulta el cliente Unity (WebGL),
// que no tiene JWT propio - confía en el jugadorID como ya hacen /add/chips y /remove/chips
// (ver ChipsController). La parte sensible (quién gana, cuánto) no depende de esta confianza:
// el resultado de cada tirada lo decide siempre GemasOfGoldSlotService server-side, nunca el
// cliente - eso es lo que evita que el cliente pueda dictar su propio resultado.
@ApiTags('GemasOfGold')
@Controller('games/gemasofgold')
export class GemasOfGoldController {
  constructor(
    private gemasOfGoldService: GemasOfGoldService,
    private gemasOfGoldSlotService: GemasOfGoldSlotService,
  ) {}

  @Get('jackpot')
  @ApiOperation({ summary: 'Current Grand/Major/Minor/Mini pot amounts (shared across all players)' })
  async jackpot() {
    return this.gemasOfGoldService.getJackpotStatus();
  }

  // Punto único de tirada: si el jugador tiene un bonus en curso, esto lo continúa (betAmount se
  // ignora); si no, es una tirada base nueva y requiere betAmount. Ver GemasOfGoldSlotService.spin.
  @Post('spin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve one base spin or one bonus free-spin for this player (server-authoritative)' })
  async spin(@Body() dto: SpinDto) {
    return this.gemasOfGoldSlotService.spin(dto.jugadorId, dto.betAmount);
  }
}
