import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { MinesService } from './mines.service';
import { StartRoundDto } from './dtos/start-round.dto';
import { RevealTileDto } from './dtos/reveal-tile.dto';
import { CashoutDto } from './dtos/cashout.dto';
import { DevSessionTokenDto } from './dtos/dev-session-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MinesSessionGuard } from '../../common/guards/mines-session.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const SESSION_TOKEN_TTL_SECONDS = 300;
const DEV_SESSION_TOKEN_TTL_SECONDS = 4 * 60 * 60;

// Both must hold, not just NODE_ENV != production: this route mints a real Mines session token
// (real start/reveal/cashout access, real chips) for ANY userId with zero authentication - it
// exists purely so BetManager.cs's Editor "Testing en Editor" block can fetch its own token
// instead of a dev pasting one by hand every 5 minutes. Requiring an explicit opt-in env var
// (never set on Render) means it stays dead even if NODE_ENV is ever left unset in production.
function devMinesTokenAllowed(): boolean {
  return process.env.ALLOW_DEV_MINES_TOKEN === 'true' && process.env.NODE_ENV !== 'production';
}

@ApiTags('Mines')
@Controller('games/mines')
export class MinesController {
  constructor(
    private minesService: MinesService,
    private jwtService: JwtService,
  ) {}

  // Called by the logged-in React frontend (real site session, JwtAuthGuard) right before it
  // builds the Unity iframe URL. The short-lived token this returns - not the raw userId - is
  // what the game client then presents to start/reveal/cashout below.
  @Post('session-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mint a short-lived token the Mines game client uses to play' })
  async issueSessionToken(@CurrentUser() user: any) {
    const token = await this.jwtService.signAsync(
      { sub: user.id, scope: 'mines' },
      { expiresIn: `${SESSION_TOKEN_TTL_SECONDS}s` },
    );
    return { token, expiresIn: SESSION_TOKEN_TTL_SECONDS };
  }

  @Post('start')
  @UseGuards(MinesSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a Mines round: validates + deducts the bet, lays server-side mines' })
  @ApiResponse({ status: 409, description: 'User already has an active round' })
  async start(@CurrentUser() user: any, @Body() dto: StartRoundDto) {
    return this.minesService.startRound(user.id, dto);
  }

  @Post('reveal')
  @UseGuards(MinesSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reveal one tile in the active round' })
  async reveal(@CurrentUser() user: any, @Body() dto: RevealTileDto) {
    return this.minesService.revealTile(user.id, dto);
  }

  @Post('cashout')
  @UseGuards(MinesSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cash out the accumulated winnings of the active round' })
  async cashout(@CurrentUser() user: any, @Body() dto: CashoutDto) {
    return this.minesService.cashout(user.id, dto);
  }

  // No guard, same as SantaWildsController: the "Gema Royal" panel polls this from the WebGL
  // client, which has no JWT of its own - read-only, leaks no user data.
  @Get('jackpot')
  @ApiOperation({ summary: 'Current Gema Royal pot amount and next-eligible-at timestamp' })
  async jackpot() {
    return this.minesService.getJackpotStatus();
  }

  // Dev-only stand-in for POST session-token (which needs a real site login/JwtAuthGuard) - lets
  // BetManager.cs's Editor testing block mint its own token for `editorJugadorId` instead of a
  // dev pasting a real one by hand every 5 minutes. See devMinesTokenAllowed(): a no-op (404) any
  // time ALLOW_DEV_MINES_TOKEN isn't explicitly set to 'true', which is never the case on Render.
  @Post('dev-session-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[dev only] Mint a Mines session token for an arbitrary userId, no auth required' })
  async devSessionToken(@Body() dto: DevSessionTokenDto) {
    if (!devMinesTokenAllowed()) {
      throw new NotFoundException();
    }

    const token = await this.jwtService.signAsync(
      { sub: dto.userId, scope: 'mines' },
      { expiresIn: `${DEV_SESSION_TOKEN_TTL_SECONDS}s` },
    );
    return { token, expiresIn: DEV_SESSION_TOKEN_TTL_SECONDS };
  }
}
