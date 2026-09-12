import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MinesRound } from './entities/mines-round.entity';
import { MinesJackpot } from './entities/mines-jackpot.entity';
import { User } from '../users/entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { MinesController } from './mines.controller';
import { MinesService } from './mines.service';
import { MinesSessionGuard } from '../../common/guards/mines-session.guard';
import { BingoModule } from '../bingo/bingo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MinesRound, User, ChipsAward, MinesJackpot]),
    // AuthModule only exports AuthService (not JwtModule), so this module registers its own
    // JwtService against the same JWT_SECRET to sign/verify Mines session tokens.
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'royal-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    // For pushing a fresh room_state (chips) to Minas's chat channel whenever a round moves
    // chips - see MinesService's use of BingoGateway/BingoService.
    BingoModule,
  ],
  controllers: [MinesController],
  providers: [MinesService, MinesSessionGuard],
  exports: [MinesService],
})
export class MinesModule {}
