import { Controller, Get, Post, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, ParseUUIDPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { TrophiesService } from './trophies.service';
import { CreateTrophyDto } from './dtos/create-trophy.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Trophies')
@Controller('trophies')
export class TrophiesController {
  constructor(private readonly trophiesService: TrophiesService) {}

  @Get('user/:userId')
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: "A user's trophies, for their profile page (public)" })
  async findByUser(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.trophiesService.findByUser(userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List every trophy ever awarded (Admin/Mod)' })
  async findAll() {
    return this.trophiesService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Award a trophy to a user (Admin/Mod)' })
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreateTrophyDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.trophiesService.create(image, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Trophy UUID' })
  @ApiOperation({ summary: 'Remove a trophy (Admin/Mod)' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.trophiesService.remove(id);
    return { message: 'Trophy deleted successfully' };
  }
}
