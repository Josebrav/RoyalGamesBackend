import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BingoRoomBot } from '../bingo/entities/bingo-room-bot.entity';
import { User } from '../users/entities/user.entity';
import { MinesModule } from '../mines/mines.module';
import { ChipsModule } from '../chips/chips.module';
import { BotsModule } from './bots.module';
import { MinesBotConfig } from './entities/mines-bot-config.entity';
import { BotUnityGameConfig } from './entities/bot-unity-game-config.entity';
import { MinesBotService } from './mines-bot.service';
import { UnityGameBotService } from './unity-game-bot.service';

/**
 * Bots jugando fuera de Bingo (Minas de verdad, juegos Unity simulados). Separado de `BotsModule`
 * (que solo tiene BotAccountService) a propósito: este módulo importa MinesModule, que a su vez
 * importa BingoModule — si BingoModule importara este módulo en vez de solo BotsModule, se
 * formaría un ciclo (BingoModule -> este módulo -> MinesModule -> BingoModule). Solo AdminModule
 * lo importa.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BingoRoomBot, User, MinesBotConfig, BotUnityGameConfig]),
    MinesModule,
    ChipsModule,
    BotsModule,
  ],
  providers: [MinesBotService, UnityGameBotService],
  exports: [MinesBotService, UnityGameBotService],
})
export class CrossGameBotsModule {}
