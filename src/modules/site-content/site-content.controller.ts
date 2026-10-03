import { Controller, Get, Patch, Put, Param, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { SiteContentService } from './site-content.service';
import { UpdateSiteContentTextDto } from './dtos/update-site-content-text.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Site Content')
@Controller('site-content')
export class SiteContentController {
  constructor(private readonly siteContentService: SiteContentService) {}

  // Public: every visitor's page render needs this, including guests with no session.
  @Get()
  @ApiOperation({ summary: 'Get all site content overrides (public)' })
  async getAll() {
    return this.siteContentService.getAll();
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiParam({ name: 'key', description: 'Content block key, e.g. home.heroTagline' })
  @ApiOperation({ summary: 'Set a text content block (Admin/Mod)' })
  async setText(
    @Param('key') key: string,
    @Body() dto: UpdateSiteContentTextDto,
    @CurrentUser() user: { id: string },
  ) {
    await this.siteContentService.setText(key, dto.text, user.id);
    return { message: 'Content updated successfully' };
  }

  @Put(':key/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'key', description: 'Content block key, e.g. home.banner1' })
  @ApiOperation({ summary: 'Set an image content block (Admin/Mod)' })
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async setImage(
    @Param('key') key: string,
    @UploadedFile() image: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    return this.siteContentService.setImage(key, image, user.id);
  }

  @Patch(':key/link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiParam({ name: 'key', description: 'Content block key, e.g. home.dashboard.banner2' })
  @ApiOperation({ summary: 'Set the destination link for an image content block (Admin/Mod)' })
  async setLink(
    @Param('key') key: string,
    @Body('linkTo') linkTo: string | undefined,
    @CurrentUser() user: { id: string },
  ) {
    return this.siteContentService.setLink(key, linkTo || null, user.id);
  }
}
