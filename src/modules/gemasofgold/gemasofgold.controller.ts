import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GemasOfGoldService } from './gemasofgold.service';

// Sin guard, mismo criterio que games/mines y santawilds: lo consulta el cliente Unity (WebGL),
// que no tiene JWT propio - solo lectura, no expone datos de usuarios.
@ApiTags('GemasOfGold')
@Controller('games/gemasofgold')
export class GemasOfGoldController {
  constructor(private gemasOfGoldService: GemasOfGoldService) {}

  @Get('jackpot')
  @ApiOperation({ summary: 'Current Grand/Major/Minor/Mini pot amounts (shared across all players)' })
  async jackpot() {
    return this.gemasOfGoldService.getJackpotStatus();
  }
}
