import { Controller, Get, UseGuards, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get('top-winners')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Top players by chips won in games (any logged-in user)' })
  async getTopWinners(@Query('limit') limitParam?: string) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
    return this.leaderboardService.getTopWinners(limit);
  }

  // Public and unauthenticated on purpose: feeds the lobby's ranking panel (weekly/monthly
  // tabs), which any player can open without logging in. Same rationale as recent-wins below.
  @Get('weekly')
  @ApiOperation({ summary: 'Top players by chips won in the last 7 days (public)' })
  async getWeekly(@Query('limit') limitParam?: string) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    return this.leaderboardService.getTopWinnersByPeriod('weekly', limit);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Top players by chips won in the last 30 days (public)' })
  async getMonthly(@Query('limit') limitParam?: string) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    return this.leaderboardService.getTopWinnersByPeriod('monthly', limit);
  }

  // Public and unauthenticated on purpose: this feeds the winners ticker on the guest
  // landing page, which is shown before anyone logs in. Only exposes nick + chips + game,
  // the same info a live "recent wins" ticker on any real casino site shows publicly.
  @Get('recent-wins')
  @ApiOperation({ summary: 'Most recent chip wins across all games (public, no auth required)' })
  async getRecentWins(@Query('limit') limitParam?: string) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 10;
    return this.leaderboardService.getRecentWins(limit);
  }

  @Get('top-winners/:gameSlug')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Top players by chips won in a specific game (any logged-in user)' })
  async getTopWinnersByGame(
    @Param('gameSlug') gameSlug: string,
    @Query('limit') limitParam?: string,
  ) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
    return this.leaderboardService.getTopWinnersByGame(gameSlug, limit);
  }
}
