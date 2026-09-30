import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DailyBonusService } from './daily-bonus.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('DailyBonus')
@Controller('daily-bonus')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DailyBonusController {
  constructor(private dailyBonusService: DailyBonusService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the current user can claim today\'s daily bonus, and which day of the streak it is' })
  async getStatus(@CurrentUser() user: any) {
    return this.dailyBonusService.getStatus(user.id);
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim today\'s daily bonus: server resolves the streak day and credits it' })
  @ApiResponse({ status: 200, description: 'Bonus awarded' })
  @ApiResponse({ status: 400, description: 'Already claimed today' })
  async claim(@CurrentUser() user: any) {
    return this.dailyBonusService.claim(user.id);
  }
}
