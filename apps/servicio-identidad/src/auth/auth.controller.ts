import {
  Controller,
  Post,
  Get,
  Body,
  Patch,
  Delete,
  Param,
  UseGuards,
  Request,
  Req,
  HttpCode,
  Res,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest, Response } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user: { sub: string; email: string; rol: string; nombre: string; sedeId?: string | null };
}
import { randomBytes } from 'node:crypto';
import { AuthService } from './auth.service';
import {
  LoginCommand,
  CrearUsuarioCommand,
  CambiarRolCommand,
  CambiarEstadoUsuarioCommand,
  ActualizarUsuarioCommand,
  CambiarPasswordUsuarioCommand,
  ListarUsuariosQuery,
  UsuarioListResponse,
  CrearSedeCommand,
  ActualizarSedeCommand,
} from '@org/contracts';
import { JwtAuthGuard, RolesGuard, Roles, CSRF_COOKIE_NAME } from '@org/shared-auth';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const COOKIE_SAME_SITE = (process.env.COOKIE_SAMESITE ?? 'strict') as
  | 'strict'
  | 'lax'
  | 'none';
const COOKIE_SECURE =
  process.env.COOKIE_SECURE == null
    ? process.env.NODE_ENV === 'production' || COOKIE_SAME_SITE === 'none'
    : process.env.COOKIE_SECURE === 'true';
// Plan 1.4: access corto (alineado con JWT_EXPIRES_IN) + refresh largo con rotación.
const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? '900'); // 15m
const ACCESS_COOKIE_MAX_AGE_MS = ACCESS_TTL_SECONDS * 1000;
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? '7');
const REFRESH_COOKIE_MAX_AGE_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Identidad' };
  }

  /* ── Públicos (sin JWT) ────────────────────────────── */

  /** Fija las cookies de sesión: access (corto), refresh (largo) y csrf. */
  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const csrfToken = randomBytes(32).toString('base64url');
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  // Carta pública/QR (T-XX): sin JWT, cualquiera con el link la llama —
  // igual que login/refresh, sin @UseGuards a propósito.
  @Get('sedes/publica')
  async sedePublica(@Query('sedeId') sedeId: string) {
    return this.authService.sedePublica(sedeId);
  }

  @HttpCode(200)
  @Post('auth/login')
  async login(
    @Body() command: LoginCommand,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(command);
    const refresh = await this.authService.issueRefreshToken(result.usuario.id);
    this.setAuthCookies(res, result.access_token, refresh.token);
    return { ...result, expires_in: ACCESS_TTL_SECONDS };
  }

  @HttpCode(200)
  @Post('auth/refresh')
  async refresh(
    @Req() req: ExpressRequest,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies as Record<string, string>)?.['refresh_token'] ?? body?.refresh_token;
    if (!raw) throw new UnauthorizedException('No hay refresh token');
    const result = await this.authService.rotateRefreshToken(raw);
    this.setAuthCookies(res, result.access_token, result.refresh.token);
    return { access_token: result.access_token, expires_in: ACCESS_TTL_SECONDS, usuario: result.usuario };
  }

  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Post('auth/logout')
  async logout(@Req() req: ExpressRequest, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeRefreshTokenByRaw((req.cookies as Record<string, string>)?.['refresh_token']);
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      path: '/',
    });
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      path: '/',
    });
    res.clearCookie(CSRF_COOKIE_NAME, {
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAME_SITE,
      path: '/',
    });
    return {
      success: true,
      message: 'Sesión cerrada correctamente en el servidor',
    };
  }

  /* ── Protegidos (requieren JWT) ────────────────────── */

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async me(@Request() req: AuthenticatedRequest) {
    return this.authService.obtenerPerfil(req.user.sub);
  }

  /* ── Gestión de usuarios (solo ADMIN) ──────────────── */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('usuarios')
  async crearUsuario(@Body() command: CrearUsuarioCommand) {
    return this.authService.crearUsuario(command);
  }

  // Lectura del equipo: visible para administración, sistema y gerencia
  // (la pantalla "Usuarios" del PWA es de solo lectura para gerencia/sistema).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('usuarios')
  async listarUsuarios(
    @Query() query: ListarUsuariosQuery,
    @Request() req: AuthenticatedRequest,
  ): Promise<UsuarioListResponse> {
    return this.authService.listarUsuarios(query, req.user.sedeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('usuarios/:id/rol')
  async cambiarRol(
    @Param('id') id: string,
    @Body() command: CambiarRolCommand,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.cambiarRol(id, command, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('usuarios/:id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() command: CambiarEstadoUsuarioCommand,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.cambiarEstado(id, command, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('usuarios/:id')
  async actualizarUsuario(
    @Param('id') id: string,
    @Body() command: ActualizarUsuarioCommand,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.actualizarUsuario(id, command, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('usuarios/:id/password')
  async cambiarPasswordUsuario(
    @Param('id') id: string,
    @Body() command: CambiarPasswordUsuarioCommand,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.cambiarPasswordUsuario(id, command, req.user.sub);
  }

  /* ── Sede propia (cualquier usuario autenticado) ─────── */

  @UseGuards(JwtAuthGuard)
  @Get('sedes/actual')
  async sedeActual(@Req() req: AuthenticatedRequest, @Query('sedeId') sedeId?: string) {
    return this.authService.sedeActual(req.user.sedeId, sedeId);
  }

  /* ── Sedes (T-23: multi-sede, solo ADMIN) ──────────── */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('sedes')
  async listarSedes() {
    return this.authService.listarSedes();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('sedes')
  async crearSede(@Body() command: CrearSedeCommand) {
    return this.authService.crearSede(command);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('sedes/:id')
  async actualizarSede(@Param('id') id: string, @Body() command: ActualizarSedeCommand) {
    return this.authService.actualizarSede(id, command);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('sedes/:id')
  async eliminarSede(@Param('id') id: string) {
    return this.authService.eliminarSede(id);
  }
}
