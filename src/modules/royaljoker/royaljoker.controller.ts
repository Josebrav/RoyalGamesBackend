import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RoyalJokerSlotService } from './royaljoker-slot.service';
import {
  RoyalJokerBonusPickDto,
  RoyalJokerSpinDto,
  RoyalJokerStateDto,
} from './dtos/royaljoker.dto';

// Sin guard, igual que SantaWildsController/GemasOfGoldController: el cliente es el build WebGL
// embebido, sin JWT, que solo conoce el jugadorID. La parte sensible (quién gana, cuánto) la decide
// siempre RoyalJokerSlotService server-side. Reemplaza, para esta slot, a remove/chips + add/chips.
@ApiTags('RoyalJoker')
@Controller('royaljoker')
export class RoyalJokerController {
  constructor(private readonly slotService: RoyalJokerSlotService) {}

  // Límite ampliado por el modo turbo/auto apuesta (varios giros seguidos), igual que santawilds/spin.
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Post('spin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve one base spin or the next free spin (server-authoritative)' })
  @ApiResponse({ status: 409, description: 'La ronda pendiente la tomó otra ventana' })
  spin(@Body() dto: RoyalJokerSpinDto) {
    return this.slotService.spin(dto.jugadorId, dto.clientToken, dto.betAmount);
  }

  @Post('bonus/pick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reveal one card of the pending bonus; pays when the last pick is made',
  })
  @ApiResponse({ status: 409, description: 'La ronda pendiente la tomó otra ventana' })
  pickBonusCard(@Body() dto: RoyalJokerBonusPickDto) {
    return this.slotService.pickBonusCard(dto.jugadorId, dto.clientToken, dto.cardIndex);
  }

  @Post('state')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pending bonus/free spins to resume on load; claims the round for this window',
  })
  state(@Body() dto: RoyalJokerStateDto) {
    return this.slotService.getState(dto.jugadorId, dto.clientToken);
  }
}
