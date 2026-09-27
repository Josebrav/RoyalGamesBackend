import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BingoController } from './bingo.controller';
import { BingoService } from './bingo.service';
import { BingoGateway } from './bingo.gateway';
import { BingoEngineService } from './bingo-engine.service';
import { BingoBotService } from './bingo-bot.service';
import { BingoBotChatService } from './bingo-bot-chat.service';
import { BingoConnectionRegistry } from './ws/bingo-connection.registry';
import { BingoRoomBot } from './entities/bingo-room-bot.entity';
import { BingoBotExtraRoom } from './entities/bingo-bot-extra-room.entity';
import { BingoBotPhraseLog } from './entities/bingo-bot-phrase-log.entity';
import { BingoPlayer } from './entities/bingo-player.entity';
import { BingoRoom } from './entities/bingo-room.entity';
import { BingoGame } from './entities/bingo-game.entity';
import { BingoSuperBingoPool } from './entities/bingo-super-bingo-pool.entity';
import { BingoCard } from './entities/bingo-card.entity';
import { BingoTicket } from './entities/bingo-ticket.entity';
import { BingoRound } from './entities/bingo-round.entity';
import { BingoWinner } from './entities/bingo-winner.entity';
import { BingoAudit } from './entities/bingo-audit.entity';
import { BingoChatMessage } from './entities/bingo-chat-message.entity';
import { BingoGiftedCardCredit } from './entities/bingo-gifted-card-credit.entity';
import { BingoNumberGuess } from './entities/bingo-number-guess.entity';
import { BingoAutoBuySubscription } from './entities/bingo-auto-buy-subscription.entity';
import { User } from '../users/entities/user.entity';
import { BotsModule } from '../bots/bots.module';

@Module({
  imports: [
    BotsModule,
    TypeOrmModule.forFeature([
      BingoPlayer,
      BingoRoom,
      BingoGame,
      BingoSuperBingoPool,
      BingoCard,
      BingoTicket,
      BingoRound,
      BingoWinner,
      BingoAudit,
      BingoChatMessage,
      BingoGiftedCardCredit,
      BingoNumberGuess,
      BingoAutoBuySubscription,
      BingoRoomBot,
      BingoBotExtraRoom,
      BingoBotPhraseLog,
      User,
    ]),
  ],
  controllers: [BingoController],
  providers: [BingoService, BingoGateway, BingoEngineService, BingoBotService, BingoBotChatService, BingoConnectionRegistry],
  // BingoGateway exported so other games' chip-moving flows (ej. MinesService) can push a fresh
  // room_state to their own isLobby chat channel after chips change - see MinesModule.
  // BingoBotService exported so AdminController can manage bots (crear/pausar/borrar).
  exports: [BingoService, BingoGateway, BingoBotService],
})
export class BingoModule {}
