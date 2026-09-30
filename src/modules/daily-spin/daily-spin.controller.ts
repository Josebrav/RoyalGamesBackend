import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DailySpinService } from './daily-spin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('DailySpin')
@Controller('daily-spin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DailySpinController {
  constructor(private dailySpinService: DailySpinService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the current user can spin the daily wheel today' })
  async getStatus(@CurrentUser() user: any) {
    return this.dailySpinService.getStatus(user.id);
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim today\'s daily spin: server picks the prize and credits it' })
  @ApiResponse({ status: 200, description: 'Prize awarded' })
  @ApiResponse({ status: 400, description: 'Already claimed today' })
  async claim(@CurrentUser() user: any) {
    return this.dailySpinService.claim(user.id);
  }
}
