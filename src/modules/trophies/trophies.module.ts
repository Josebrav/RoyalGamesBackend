import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trophy } from './entities/trophy.entity';
import { TrophiesController } from './trophies.controller';
import { TrophiesService } from './trophies.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

@Module({
  imports: [TypeOrmModule.forFeature([Trophy])],
  controllers: [TrophiesController],
  providers: [TrophiesService, CloudinaryService],
})
export class TrophiesModule {}
