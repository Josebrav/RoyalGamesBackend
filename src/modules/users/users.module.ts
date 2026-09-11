import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import { ChipsAward } from '../chips/entities/chips-award.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './repositories/users.repository';
import { MailingModule } from '../mailing/mailing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ChipsAward]),
    MailingModule,
    // AuthModule only exports AuthService (not JwtModule), so this module registers its own
    // JwtService against the same JWT_SECRET — used to mint the short-lived Bazar session
    // token (see UsersController.issueBazarSessionToken), same pattern as MinesModule.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
