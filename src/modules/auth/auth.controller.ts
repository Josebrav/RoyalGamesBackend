import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { GoogleAuthDto } from './dtos/google-auth.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
const IS_PROD = process.env.NODE_ENV === 'production';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * SameSite=None + Secure es lo correcto para el caso real (front y backend en
   * dominios distintos), pero en dev (http://localhost) el browser directamente
   * ignora una cookie SameSite=None que no sea Secure — ahí no hace falta cross-site
   * de todos modos (mismo localhost), así que se usa Lax + no-Secure.
   */
  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with nick/email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refresh_token, ...body } = await this.authService.login(loginDto, req);
    this.setRefreshCookie(res, refresh_token);
    return body;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login or register with Google',
    description:
      'Receives a Google id_token, verifies it, and returns a Royal Games JWT. ' +
      'Creates the user automatically if it does not exist.',
  })
  @ApiResponse({ status: 200, description: 'Login successful, returns access_token and user data' })
  @ApiResponse({ status: 401, description: 'Invalid or expired Google token' })
  async loginWithGoogle(
    @Body() googleAuthDto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refresh_token, ...body } = await this.authService.loginWithGoogle(
      googleAuthDto.token,
      req,
    );
    this.setRefreshCookie(res, refresh_token);
    return body;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token (rotates the refresh token)',
  })
  @ApiResponse({ status: 200, description: 'New access_token issued' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, expired or reused refresh token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Defensa CSRF barata: un <form> o <img> cross-site puede disparar este POST con la
    // cookie puesta sola, pero no puede agregarle un header custom sin que el navegador
    // dispare un preflight CORS — que main.ts solo deja pasar para los orígenes de
    // ALLOWED_ORIGINS. Un request cross-site "silencioso" nunca trae este header.
    if (req.headers['x-refresh'] !== '1') {
      throw new UnauthorizedException('Missing refresh header');
    }
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const { refresh_token, ...body } = await this.authService.refresh(rawToken, req);
    this.setRefreshCookie(res, refresh_token);
    return body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token and clear its cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(rawToken);
    this.clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using the token received by email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
