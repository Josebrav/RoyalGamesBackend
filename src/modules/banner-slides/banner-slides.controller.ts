import { Controller, Get, Post, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, ParseUUIDPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { BannerSlidesService } from './banner-slides.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Banner Slides')
@Controller('banner-slides')
export class BannerSlidesController {
  constructor(private readonly bannerSlidesService: BannerSlidesService) {}

  @Get()
  @ApiOperation({ summary: 'List all banner carousel slides (public)' })
  async findAll() {
    return this.bannerSlidesService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add a banner slide (Admin/Mod)' })
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async create(
    @UploadedFile() image: Express.Multer.File,
    @Body('linkTo') linkTo: string | undefined,
    @CurrentUser() user: { id: string },
  ) {
    return this.bannerSlidesService.create(image, user.id, linkTo || null);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Banner slide UUID' })
  @ApiOperation({ summary: 'Remove a banner slide (Admin/Mod)' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.bannerSlidesService.remove(id);
    return { message: 'Slide deleted successfully' };
  }
}
