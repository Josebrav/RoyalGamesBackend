import {
  Controller,
  Put,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChipsService } from './chips.service';
import { ChipsTransactionDto } from './dtos/chips-transaction.dto';
import { GiftChipsDto } from './dtos/gift-chips.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { resolveGameSlugFromOrigin } from '../../common/constants/game-origins';

@ApiTags('Chips')
@Controller()
export class ChipsController {
  constructor(private chipsService: ChipsService) {}

  // NOTE: intentionally NOT admin-only. The external iframe-hosted games (Minas, Pachinka,
  // Royal Joker — see ALLOWED_ORIGINS) settle bets/winnings by calling this endpoint directly
  // with no JWT (they only know the player's userId). OptionalJwtAuthGuard is used purely to
  // tag who made the call (admin vs. an anonymous game client) for the chips_awards ledger —
  // it never blocks the request.
  // Límite propio más alto que el default global (100/60s): el modo turbo de los slots puede
  // tirar varios giros por segundo, y cada giro ganador pega acá - con el límite global
  // compartido entre todos los endpoints, una sesión jugando rápido lo agotaba enseguida y el
  // juego se quedaba sin poder acreditar/descontar fichas (ver remove/chips más abajo).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Put('add/chips')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add chips to user (called by admins and by the external games)' })
  @ApiResponse({ status: 200, description: 'Chips added successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async addChips(
    @Body() chipsTransactionDto: ChipsTransactionDto,
    @CurrentUser() user: any,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
  ) {
    const isStaff = user?.role === Role.ADMIN || user?.role === Role.MOD;
    const source = isStaff ? 'admin' : 'game';
    const refererOrigin = referer ? referer.split('/').slice(0, 3).join('/') : undefined;
    const game = resolveGameSlugFromOrigin(origin) || resolveGameSlugFromOrigin(refererOrigin);
    return this.chipsService.addChips(chipsTransactionDto, source, game, isStaff ? user.id : null);
  }

  // Mismo límite más alto que add/chips arriba (modo turbo de los slots).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Put('remove/chips')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove chips from user (called by admins and by the external games)' })
  @ApiResponse({ status: 200, description: 'Chips removed successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient chips' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async removeChips(@Body() chipsTransactionDto: ChipsTransactionDto, @CurrentUser() user: any) {
    const isStaff = user?.role === Role.ADMIN || user?.role === Role.MOD;
    const source = isStaff ? 'admin' : 'game';
    return this.chipsService.removeChips(chipsTransactionDto, source, isStaff ? user.id : null);
  }

  // Real chip-to-chip transfer between two logged-in users (the profile's "Regalar Fichas"
  // action). Unlike add/remove above, the sender is always the authenticated caller — never
  // trusted from the request body — so this can't be used to drain an arbitrary account.
  @Post('chips/gift')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gift chips from the current user to another user' })
  @ApiResponse({ status: 200, description: 'Chips transferred successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient chips or invalid amount' })
  @ApiResponse({ status: 404, description: 'Recipient not found' })
  async giftChips(@Body() dto: GiftChipsDto, @CurrentUser() user: any) {
    return this.chipsService.giftChips(user.id, dto.toUserId, dto.amount);
  }

  @Get('chips/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'My chip movement history (deposits + non-game adjustments, no gameplay)' })
  async getHistory(@CurrentUser() user: any) {
    return this.chipsService.getHistory(user.id);
  }

  @Get('admin/users/:userId/chips-history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: "A specific user's chip movement history (Admin/Mod)" })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  async getUserHistory(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.chipsService.getHistory(userId);
  }

  @Get('chips/:userId')
  @ApiOperation({ summary: 'Get user chips balance' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Chips retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getChips(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.chipsService.getChips(userId);
  }
}
