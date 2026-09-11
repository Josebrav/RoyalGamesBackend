import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  ForbiddenException,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { UpdateAvatarDto } from './dtos/update-avatar.dto';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { AdminSetEmailDto } from './dtos/admin-set-email.dto';
import { AdminSetPasswordDto } from './dtos/admin-set-password.dto';
import { AdminSetDescriptionDto } from './dtos/admin-set-description.dto';
import { ManageUserDto } from './dtos/manage-user.dto';
import { AdminUserDto } from './dtos/admin-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

const BAZAR_SESSION_TOKEN_TTL_SECONDS = 300;

@ApiTags('Users')
@Controller()
export class UsersController {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // Igual patrón que games/mines/session-token: la SPA (con sesión real, JwtAuthGuard) pide
  // este token corto antes de abrir el iframe del editor de Bazar. Preparado pero TODAVÍA NO
  // exigido en PUT user/:userId/avatar — esa app vive aparte en S3 y hay que actualizarla
  // primero para que pida y mande este token antes de activar el guard ahí (si no, se rompe
  // el guardado de avatar en producción). Ver memoria/plan de la Tarea 10.
  @Post('bazar/session-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mint a short-lived token the Bazar avatar editor uses to identify the player' })
  async issueBazarSessionToken(@CurrentUser() user: any) {
    const token = await this.jwtService.signAsync(
      { sub: user.id, scope: 'bazar' },
      { expiresIn: `${BAZAR_SESSION_TOKEN_TTL_SECONDS}s` },
    );
    return { token, expiresIn: BAZAR_SESSION_TOKEN_TTL_SECONDS };
  }

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email or nick already exists' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    console.log(createUserDto);
    return this.usersService.createUser(createUserDto);
  }

  @Get('getUsers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get('users/count')
  @ApiOperation({ summary: 'Get total registered user count (public)' })
  @ApiResponse({ status: 200, description: 'Count retrieved successfully' })
  async getUsersCount() {
    return this.usersService.getUsersCount();
  }

  @Put('users/heartbeat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the current user as recently active, optionally noting what page/game they are on' })
  async heartbeat(@CurrentUser() user: any, @Body('currentPath') currentPath?: string) {
    await this.usersService.updateLastSeen(user.id, currentPath ?? null);
    return { ok: true };
  }

  @Get('users/online')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recently active users (any logged-in user)' })
  async getOnlineUsers() {
    return this.usersService.getOnlineUsers();
  }

  @Get('user/:id')
  @ApiOperation({
    summary:
      'Get a user public profile by ID (no auth). Safe projection only — never ' +
      'email, googleId, referralCode or other PII.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Public profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.getUserById(id);
  }

  @Get('user-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by email' })
  @ApiQuery({ name: 'email', description: 'User email' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserByEmail(@Query('email') email: string) {
    return this.usersService.getUserByEmail(email);
  }

  @Get('user-nick')
  @ApiOperation({
    summary:
      'Get a user public profile by nick (no auth). Safe projection only — never ' +
      'email, googleId, referralCode or other PII. nick→email resolution for login ' +
      'now happens server-side in POST /auth/login.',
  })
  @ApiQuery({ name: 'nick', description: 'User nickname' })
  @ApiResponse({ status: 200, description: 'Public profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserByNick(@Query('nick') nick: string) {
    return this.usersService.getUserByNick(nick);
  }

  @Get('check-availability')
  @ApiOperation({
    summary:
      'Check whether a nick and/or email are already registered (public). Returns booleans only, never user data, so it is safe to call before signup/login.',
  })
  @ApiQuery({ name: 'nick', description: 'Nickname to check', required: false })
  @ApiQuery({ name: 'email', description: 'Email to check', required: false })
  @ApiResponse({ status: 200, description: 'Availability flags returned' })
  async checkAvailability(
    @Query('nick') nick?: string,
    @Query('email') email?: string,
  ) {
    return this.usersService.checkAvailability(nick, email);
  }

  @Patch('actualizar-usuario/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot update another user profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    // Verify user can only update their own profile
    if (user.id !== userId) {
      throw new ForbiddenException('Cannot update another user profile');
    }
    console.log(updateUserDto);
    return this.usersService.updateUser(userId, updateUserDto);
  }

  @Patch('users/:userId/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change my own password (requires current password)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot change another user password' })
  async changePassword(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: any,
  ) {
    if (user.id !== userId) {
      throw new ForbiddenException('Cannot change another user password');
    }
    await this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Delete('user-delete/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteUser(@Param('userId', new ParseUUIDPipe()) userId: string) {
    await this.usersService.deleteUser(userId);
    return { message: 'User deleted successfully' };
  }

  @Put('user-ban')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban/Unban user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User ban status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async banUser(@Body() manageUserDto: ManageUserDto) {
    return this.usersService.banUser(manageUserDto);
  }

  @Put('inactivar-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inactivate/Activate user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User inactive status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async inactiveUser(@Body() manageUserDto: ManageUserDto) {
    return this.usersService.inactiveUser(manageUserDto);
  }

  @Put('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set user admin status (Admin only)' })
  @ApiResponse({ status: 200, description: 'User admin status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async setUserAdmin(@Body() adminUserDto: AdminUserDto) {
    return this.usersService.setUserAdmin(adminUserDto);
  }

  @Patch('admin/users/:userId/email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change another user's email (Admin only, for account recovery)" })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Email updated successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async adminSetEmail(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminSetEmailDto,
  ) {
    return this.usersService.adminSetEmail(userId, dto.email);
  }

  @Patch('admin/users/:userId/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reset another user's password (Admin only, for account recovery)" })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Password updated successfully' })
  async adminSetPassword(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminSetPasswordDto,
  ) {
    await this.usersService.adminSetPassword(userId, dto.newPassword);
    return { message: 'Password updated successfully' };
  }

  @Patch('admin/users/:userId/description')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MOD)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit another user's profile description (Admin/Mod)" })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Description updated successfully' })
  async adminSetDescription(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminSetDescriptionDto,
  ) {
    return this.usersService.adminSetDescription(userId, dto.description);
  }

  @Put('firstchips/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Give first chips to user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'First chips given' })
  @ApiResponse({ status: 400, description: 'User already received first chips' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async giveFirstChips(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.usersService.giveFirstChips(userId);
  }

  @Put('user/:userId/avatar')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'avatar', maxCount: 1 },
        { name: 'avatarThumb', maxCount: 1 },
      ],
      { storage: memoryStorage() },
    ),
  )
  @ApiOperation({ summary: 'Update user avatar image (multipart, optionally with a square thumbnail) and avatar JSON data' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot update another user profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateAvatar(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @UploadedFiles() files: { avatar?: Express.Multer.File[]; avatarThumb?: Express.Multer.File[] },
    @Body() body: any,
  ) {
    const file = files?.avatar?.[0];
    const thumbFile = files?.avatarThumb?.[0];
    const avatarDataRaw = body?.avatarData;
    let avatarData: any = undefined;

    if (avatarDataRaw !== undefined) {
      if (typeof avatarDataRaw === 'string') {
        try {
          avatarData = JSON.parse(avatarDataRaw);
        } catch (e) {
          console.warn('Could not parse avatarData JSON string:', avatarDataRaw);
          avatarData = avatarDataRaw;
        }
      } else {
        avatarData = avatarDataRaw;
      }
    }

    console.log('updateAvatar request', {
      userId,
      file: file ? { originalname: file.originalname, mimetype: file.mimetype, size: file.size } : null,
      thumbFile: thumbFile ? { originalname: thumbFile.originalname, mimetype: thumbFile.mimetype, size: thumbFile.size } : null,
      avatarData,
    });

    return this.usersService.updateAvatarWithFile(userId, file, avatarData, thumbFile);
  }

  @Get('user/:userId/avatar-data')
  @ApiOperation({ summary: 'Get user avatar JSON data' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Avatar JSON retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAvatarData(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.usersService.getAvatarData(userId);
  }

  @Get('user/:userId/avatar-image')
  @ApiOperation({ summary: 'Get user avatar image bytes (full capture, not cropped — same avatar as seen in Unity)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Avatar image retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAvatarImage(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res() res: Response,
  ) {
    // El perfil (y el resto del frontend) tiene que mostrar el avatar completo, sin ningún
    // recorte agregado — tal como se ve en Unity. avatarBin es exactamente eso: la captura
    // completa, solo recortada por transparencia (sin relleno vacío alrededor), nunca
    // recompuesta en un cuadrado. avatarThumbBin (servido aparte en /avatar-thumbnail) es un
    // recorte cuadrado pensado para íconos chicos tipo nav, no para esto.
    const result = await this.usersService.getAvatarBinary(userId);
    if (!result || !result.buffer) {
      throw new ForbiddenException('User or avatar not found');
    }
    res.setHeader('Content-Type', result.mime || 'application/octet-stream');
    return res.send(result.buffer);
  }

  @Get('user/:userId/avatar-thumbnail')
  @ApiOperation({ summary: 'Get user avatar thumbnail (square, head-focused crop) bytes' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Avatar thumbnail retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAvatarThumbnail(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res() res: Response,
  ) {
    const result = await this.usersService.getAvatarThumbnailBinary(userId);
    if (!result || !result.buffer) {
      throw new ForbiddenException('User or avatar not found');
    }
    res.setHeader('Content-Type', result.mime || 'application/octet-stream');
    return res.send(result.buffer);
  }
}
