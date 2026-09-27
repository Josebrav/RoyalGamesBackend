import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { BotAccountService } from './bot-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [BotAccountService],
  exports: [BotAccountService],
})
export class BotsModule {}
