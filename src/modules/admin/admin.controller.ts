import { Body, Controller, Delete, Get, Patch, Post, Query, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { MinesService } from '../mines/mines.service';
import { BingoService } from '../bingo/bingo.service';
import { BingoBotService } from '../bingo/bingo-bot.service';
import { CreateBingoBotDto } from '../bingo/dtos/create-bingo-bot.dto';
import { UpdateBingoBotDto } from '../bingo/dtos/update-bingo-bot.dto';
import { ConnectBingoBotDto } from '../bingo/dtos/connect-bingo-bot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MOD)
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private minesService: MinesService,
    private bingoService: BingoService,
    private bingoBotService: BingoBotService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform-wide stats overview (money figures admin-only, rest also visible to mods)' })
  async getOverview(@CurrentUser() user: { role: Role }) {
    return this.adminService.getOverview(user.role);
  }

  @Get('deposits')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Full deposit log across all users (Admin only)' })
  async getDeposits(@Query('limit') limitParam?: string) {
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200;
    return this.adminService.getDeposits(limit);
  }

  @Get('referrals')
  @ApiOperation({ summary: 'Referral tracking: who referred whom and their deposit status (Admin only)' })
  async getReferrals() {
    return this.adminService.getReferrals();
  }

  @Get('users/:userId/activity-summary')
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: "Cheap count-only snapshot of a user's activity (Admin/Mod)" })
  async getUserActivitySummary(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.adminService.getUserActivitySummary(userId);
  }

  @Get('users/:userId/mines-rounds')
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: "A user's Mines round history (Admin/Mod)" })
  async getUserMinesRounds(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.minesService.getUserActivity(userId);
  }

  @Get('users/:userId/bingo-activity')
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: "A user's Bingo winnings and gifted cards (Admin/Mod)" })
  async getUserBingoActivity(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.bingoService.getUserBingoActivity(userId);
  }

  @Get('mods/:modId/audit')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'modId', description: 'Moderator UUID' })
  @ApiOperation({ summary: 'Everything a specific mod did themselves — panel grants, self gifts, card gifts (Admin only)' })
  async getModAudit(@Param('modId', new ParseUUIDPipe()) modId: string) {
    return this.adminService.getModAudit(modId);
  }

  // --- Bots de Bingo (economía de la casa, solo admin — ver plan "Bots de Bingo") ---

  @Get('bingo-bots')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all Bingo bots, with room name and live chip balance (Admin only)' })
  async listBingoBots() {
    return this.bingoBotService.listBots();
  }

  @Get('bingo-bots/rooms')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bingo rooms available to assign a bot to (Admin only)' })
  async listBingoBotRooms() {
    return this.bingoService.getRooms();
  }

  @Post('bingo-bots')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a Bingo bot account and assign it to a room (Admin only)' })
  async createBingoBot(@Body() dto: CreateBingoBotDto) {
    return this.bingoBotService.createBot(dto);
  }

  @Patch('bingo-bots/:id')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'BingoRoomBot UUID' })
  @ApiOperation({ summary: "Update a Bingo bot's cards/auto-top-up settings (Admin only)" })
  async updateBingoBot(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBingoBotDto) {
    return this.bingoBotService.updateBot(id, dto);
  }

  @Post('bingo-bots/:id/connect')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'BingoRoomBot UUID' })
  @ApiOperation({ summary: 'Connect an existing (reusable) bot to a room — same one or a different one (Admin only)' })
  async connectBingoBot(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ConnectBingoBotDto) {
    return this.bingoBotService.connectBot(id, dto);
  }

  @Post('bingo-bots/:id/disconnect')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'BingoRoomBot UUID' })
  @ApiOperation({ summary: 'Disconnect a bot from its current room without deleting it — stays reusable (Admin only)' })
  async disconnectBingoBot(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bingoBotService.disconnectBot(id);
  }

  @Delete('bingo-bots/:id')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'BingoRoomBot UUID' })
  @ApiOperation({ summary: 'Permanently delete a bot account (Admin only)' })
  async deleteBingoBot(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bingoBotService.deleteBot(id);
  }
}
