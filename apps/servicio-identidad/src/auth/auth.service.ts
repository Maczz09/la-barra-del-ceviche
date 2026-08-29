import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OperableLog } from '@org/observabilidad';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  CrearUsuarioCommand,
  LoginCommand,
  LoginResponseDto,
  CambiarRolCommand,
  CambiarEstadoUsuarioCommand,
  ActualizarUsuarioCommand,
  CambiarPasswordUsuarioCommand,
  RolUsuario,
  ListarUsuariosQuery,
  UsuarioListResponse,
  SedeDto,
  SedePublicaDto,
  CrearSedeCommand,
  ActualizarSedeCommand,
} from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';
import { toUsuarioDto } from './usuarios.mapper';

const SALT_ROUNDS = 12;
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? '7');
// Ventana corta para distinguir una carrera legítima de refresh de un reuso tardío/robado.
const REFRESH_REUSE_GRACE_MS = 10_000;

// T-35: hash dummy precomputado al arrancar. Cuando el email no existe o el
// usuario está inactivo/bloqueado se ejecuta igualmente un bcrypt.compare contra
// este hash, para que la latencia del 401 no revele si la cuenta existe.
const DUMMY_HASH = bcrypt.hashSync('dummy', SALT_ROUNDS);

const MAX_FAILED_ATTEMPTS = 5;
// Backoff exponencial: intento 5→1min, 6→5min, 7+→15min (tope)
const LOCKOUT_DURATIONS_MS = [60_000, 300_000, 900_000];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /* ── Login ─────────────────────────────────────────── */

  async login(command: LoginCommand): Promise<LoginResponseDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: command.email },
    });

    if (!usuario?.activo) {
      // T-35: igualar el timing con la rama de password incorrecta
      await bcrypt.compare(command.password, DUMMY_HASH);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // T-03: verificar bloqueo temporal
    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      // T-35: igualar el timing con la rama de password incorrecta
      await bcrypt.compare(command.password, DUMMY_HASH);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValido = await bcrypt.compare(command.password, usuario.password);
    if (!passwordValido) {
      // Incremento atómico de fallos y cálculo de bloqueo si se alcanza el tope
      const nuevosFallos = usuario.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;
      if (nuevosFallos >= MAX_FAILED_ATTEMPTS) {
        const lockoutIndex = Math.min(
          nuevosFallos - MAX_FAILED_ATTEMPTS,
          LOCKOUT_DURATIONS_MS.length - 1,
        );
        lockedUntil = new Date(Date.now() + LOCKOUT_DURATIONS_MS[lockoutIndex]);
      }
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { failedLoginAttempts: { increment: 1 }, lockedUntil },
      });
      if (lockedUntil) {
        await this.registrarAuditoria('CUENTA_BLOQUEADA', usuario.id, 'servicio-identidad');
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
      sedeId: usuario.sedeId,
    };

    const access_token = this.jwt.sign(payload);

    // T-05: re-hash perezoso si el costo almacenado es menor al actual.
    // Debe re-hashear el texto plano recién verificado, NO el hash almacenado
    // (hashear el hash deja una credencial que ya no coincide con la contraseña).
    const rehashPromise = bcrypt.getRounds(usuario.password) < SALT_ROUNDS
      ? bcrypt.hash(command.password, SALT_ROUNDS).then((nuevoHash) =>
          this.prisma.usuario.update({ where: { id: usuario.id }, data: { password: nuevoHash } }),
        )
      : Promise.resolve();

    // T-15: el evento UsuarioAutenticado (sin consumidores, con email en el payload)
    // fue retirado. Login exitoso = resetear contadores de lockout + auditoría, en una
    // transacción para que ambas escrituras sean atómicas.
    await Promise.all([
      rehashPromise,
      this.prisma.$transaction(async (prisma) => {
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
        await prisma.auditoriaLog.create({ data: { accion: 'LOGIN', usuarioId: usuario.id, servicio: 'servicio-identidad' } });
      }),
    ]);

    this.logger.log({
      operation: 'login',
      aggregateId: usuario.id,
      message: `Login exitoso (rol ${usuario.rol}).`,
    } satisfies OperableLog);

    return {
      access_token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol as RolUsuario,
        sedeId: usuario.sedeId,
      },
    };
  }

  /* ── Refresh tokens (plan 1.4) ─────────────────────── */

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private buildRefreshToken(userId: string): { token: string; tokenHash: string; expiresAt: Date; userId: string } {
    const token = randomBytes(48).toString('base64url');
    return {
      token,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
      userId,
    };
  }

  private signAccessToken(usuario: { id: string; email: string; rol: string; nombre: string; sedeId: string | null }): string {
    return this.jwt.sign({ sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre, sedeId: usuario.sedeId });
  }

  /** Crea un refresh token opaco, guarda su hash y devuelve el valor en claro. */
  async issueRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const refresh = this.buildRefreshToken(userId);
    await this.prisma.refreshToken.create({
      data: { userId: refresh.userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
    });
    return { token: refresh.token, expiresAt: refresh.expiresAt };
  }

  private async revocarCadenaRefresh(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private esCarreraReciente(token: { revokedAt: Date | null; replacedById?: string | null }): boolean {
    return Boolean(
      token.revokedAt &&
      token.replacedById &&
      token.revokedAt.getTime() > Date.now() - REFRESH_REUSE_GRACE_MS,
    );
  }

  /**
   * Rota un refresh token: valida, emite uno nuevo y revoca el anterior. Si llega
   * un token YA revocado (reuso), revoca toda la cadena del usuario y rechaza.
   */
  async rotateRefreshToken(rawToken: string): Promise<{
    access_token: string;
    refresh: { token: string; expiresAt: Date };
    usuario: { id: string; nombre: string; email: string; rol: RolUsuario; sedeId: string | null };
  }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) throw new UnauthorizedException('Refresh token inválido');

    if (existing.revokedAt) {
      if (this.esCarreraReciente(existing)) {
        throw new UnauthorizedException('Refresh token ya utilizado');
      }
      // Reuso detectado: alguien presentó un token ya rotado → revocar la cadena completa.
      await this.revocarCadenaRefresh(existing.userId);
      this.logger.warn({
        operation: 'rotateRefreshToken',
        aggregateId: existing.userId,
        errorCode: 'REFRESH_TOKEN_REUSE',
        resultingState: 'CADENA_REVOCADA',
        message: 'Reuso de refresh token detectado (token ya revocado); cadena completa revocada.',
      } satisfies OperableLog);
      throw new UnauthorizedException('Refresh token ya utilizado');
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: existing.userId } });
    if (!usuario?.activo) throw new UnauthorizedException('Usuario no disponible');

    // T-34: compare-and-swap — solo un caller puede revocar el token presentado.
    // La revocación condicional atómica reemplaza la secuencia leer→emitir→revocar:
    // dos refresh concurrentes con el mismo token ya no emiten dos pares.
    const nuevo = this.buildRefreshToken(usuario.id);
    const rotacion = await this.prisma.$transaction(async (prisma) => {
      const revocados = await prisma.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revocados.count !== 1) return null;

      const nuevoReg = await prisma.refreshToken.create({
        data: {
          userId: nuevo.userId,
          tokenHash: nuevo.tokenHash,
          expiresAt: nuevo.expiresAt,
        },
      });
      await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { replacedById: nuevoReg.id },
      });
      return nuevoReg;
    });

    if (!rotacion) {
      const actualizado = await this.prisma.refreshToken.findUnique({ where: { id: existing.id } });
      if (actualizado && this.esCarreraReciente(actualizado)) {
        throw new UnauthorizedException('Refresh token ya utilizado');
      }

      await this.revocarCadenaRefresh(existing.userId);
      this.logger.warn({
        operation: 'rotateRefreshToken',
        aggregateId: existing.userId,
        errorCode: 'REFRESH_TOKEN_REUSE',
        resultingState: 'CADENA_REVOCADA',
        message: 'Reuso de refresh token detectado (carrera de rotación perdida); cadena completa revocada.',
      } satisfies OperableLog);
      throw new UnauthorizedException('Refresh token ya utilizado');
    }

    return {
      access_token: this.signAccessToken(usuario),
      refresh: { token: nuevo.token, expiresAt: nuevo.expiresAt },
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol as RolUsuario, sedeId: usuario.sedeId },
    };
  }

  /** Revoca el refresh token presentado (logout). No lanza si no existe. */
  async revokeRefreshTokenByRaw(rawToken?: string | null): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /* ── Perfil del usuario autenticado ────────────────── */

  async obtenerPerfil(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return toUsuarioDto(usuario);
  }

  /* ── CRUD de usuarios (solo ADMIN) ─────────────────── */

  async crearUsuario(command: CrearUsuarioCommand) {
    const existe = await this.prisma.usuario.findUnique({
      where: { email: command.email },
    });

    if (existe) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    // T-23 (multi-sede): un ADMIN queda sin sede fija (administra la que
    // elija); cualquier otro rol necesita quedar pineado a una sede activa.
    let sedeId: string | null = null;
    if (command.rol !== 'ADMIN') {
      if (!command.sedeId) {
        throw new BadRequestException('Indica la sede (sedeId) para este rol.');
      }
      const sede = await this.prisma.sede.findUnique({ where: { id: command.sedeId } });
      if (!sede || !sede.activa) {
        throw new BadRequestException('La sede indicada no existe o está inactiva.');
      }
      sedeId = sede.id;
    }

    const hashedPassword = await bcrypt.hash(command.password, SALT_ROUNDS);

    const usuario = await this.prisma.usuario.create({
      data: {
        nombre: command.nombre,
        email: command.email,
        password: hashedPassword,
        rol: command.rol,
        sedeId,
        telefono: command.telefono?.trim() || null,
      },
    });

    await this.registrarAuditoria('CREAR_USUARIO', usuario.id, 'servicio-identidad');

    this.logger.log({
      operation: 'crearUsuario',
      aggregateId: usuario.id,
      resultingState: usuario.rol,
      message: 'Usuario creado.',
    } satisfies OperableLog);
    return toUsuarioDto(usuario);
  }

  async listarUsuarios(query: ListarUsuariosQuery = {}, usuarioSedeId?: string | null): Promise<UsuarioListResponse> {
    const limit = this.normalizeLimit(query.limit);
    // T-23: un usuario pineado a una sede solo ve el equipo de esa sede; el
    // admin general (sin sede fija) puede filtrar por sedeId o ver todas.
    const sedeIdEfectiva = usuarioSedeId ?? query.sedeId;
    const where: Prisma.UsuarioWhereInput = {
      ...(sedeIdEfectiva ? { sedeId: sedeIdEfectiva } : {}),
      ...(query.rol ? { rol: query.rol } : {}),
      ...(query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.updatedSince
        ? { updatedAt: { gte: new Date(query.updatedSince) } }
        : {}),
    };

    const usuarios = await this.prisma.usuario.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = usuarios.length > limit;
    const data = usuarios.slice(0, limit);

    return {
      data: data.map(toUsuarioDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  async cambiarRol(id: string, command: CambiarRolCommand, ejecutadoPor: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Rechazar siempre la auto-degradación (decisión T-04)
    if (id === ejecutadoPor && command.rol !== 'ADMIN') {
      throw new ConflictException('No se puede auto-degradar: use otro administrador para cambiar su propio rol');
    }

    // T-31: si el objetivo es ADMIN y se degrada, verificar dentro de una transacción
    // que quede al menos un ADMIN activo. Postgres no admite FOR UPDATE con agregaciones,
    // así que se bloquean las filas ADMIN (lock por id) y se cuenta en aplicación; el lock
    // se mantiene hasta el commit y serializa degradaciones concurrentes.
    let actualizado;
    if (usuario.rol === 'ADMIN' && command.rol !== 'ADMIN') {
      actualizado = await this.prisma.$transaction(async (tx) => {
        const admins = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Usuario"
          WHERE rol = 'ADMIN' AND activo = true
          FOR UPDATE
        `;
        if (admins.length <= 1) {
          throw new ConflictException('No se puede degradar al último administrador activo');
        }
        const usuarioActualizado = await tx.usuario.update({
          where: { id },
          data: { rol: command.rol },
        });
        await tx.auditoriaLog.create({
          data: {
            accion: `CAMBIAR_ROL:${command.rol}:por:${ejecutadoPor}`,
            usuarioId: id,
            servicio: 'servicio-identidad',
          },
        });
        return usuarioActualizado;
      });
    } else {
      actualizado = await this.prisma.usuario.update({
        where: { id },
        data: { rol: command.rol },
      });
      await this.registrarAuditoria(`CAMBIAR_ROL:${command.rol}:por:${ejecutadoPor}`, id, 'servicio-identidad');
    }

    this.logger.log({
      operation: 'cambiarRol',
      aggregateId: actualizado.id,
      resultingState: command.rol,
      message: 'Rol de usuario actualizado.',
    } satisfies OperableLog);
    return toUsuarioDto(actualizado);
  }

  /**
   * Activar/desactivar usuario (soft-delete). No se expone borrado real:
   * AuditoriaLog.usuarioId y RefreshToken.userId no tienen FK con cascada,
   * un DELETE dejaría el historial de auditoría huérfano.
   */
  async cambiarEstado(id: string, command: CambiarEstadoUsuarioCommand, ejecutadoPor: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (id === ejecutadoPor && !command.activo) {
      throw new ConflictException('No se puede auto-desactivar: use otro administrador');
    }

    let actualizado;
    if (usuario.rol === 'ADMIN' && !command.activo) {
      // Mismo patrón de lock que cambiarRol (T-31): serializa desactivaciones
      // concurrentes para no dejar el sistema sin ningún admin activo.
      actualizado = await this.prisma.$transaction(async (tx) => {
        const admins = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Usuario"
          WHERE rol = 'ADMIN' AND activo = true
          FOR UPDATE
        `;
        if (admins.length <= 1) {
          throw new ConflictException('No se puede desactivar al último administrador activo');
        }
        const usuarioActualizado = await tx.usuario.update({
          where: { id },
          data: { activo: command.activo },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditoriaLog.create({
          data: {
            accion: `CAMBIAR_ESTADO:${command.activo ? 'ACTIVAR' : 'DESACTIVAR'}:por:${ejecutadoPor}`,
            usuarioId: id,
            servicio: 'servicio-identidad',
          },
        });
        return usuarioActualizado;
      });
    } else {
      actualizado = await this.prisma.$transaction(async (tx) => {
        const usuarioActualizado = await tx.usuario.update({
          where: { id },
          data: { activo: command.activo },
        });
        if (!command.activo) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return usuarioActualizado;
      });
      await this.registrarAuditoria(
        `CAMBIAR_ESTADO:${command.activo ? 'ACTIVAR' : 'DESACTIVAR'}:por:${ejecutadoPor}`,
        id,
        'servicio-identidad',
      );
    }

    this.logger.log({
      operation: 'cambiarEstado',
      aggregateId: actualizado.id,
      resultingState: command.activo ? 'ACTIVO' : 'INACTIVO',
      message: 'Estado de usuario actualizado.',
    } satisfies OperableLog);
    return toUsuarioDto(actualizado);
  }

  /** Datos de perfil editables por un ADMIN — hoy solo teléfono. */
  async actualizarUsuario(id: string, command: ActualizarUsuarioCommand, ejecutadoPor: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: { telefono: command.telefono?.trim() || null },
    });
    await this.registrarAuditoria(`ACTUALIZAR_PERFIL:por:${ejecutadoPor}`, id, 'servicio-identidad');

    this.logger.log({
      operation: 'actualizarUsuario',
      aggregateId: actualizado.id,
      message: 'Perfil de usuario actualizado.',
    } satisfies OperableLog);
    return toUsuarioDto(actualizado);
  }

  /**
   * Reseteo de contraseña por un ADMIN — no requiere la contraseña actual
   * (a diferencia de un self-service "cambiar mi contraseña", que no
   * existe todavía). Revoca las sesiones activas del usuario, igual que
   * cambiarEstado(activo:false): una contraseña reseteada no debería dejar
   * sesiones viejas vivas con el token anterior.
   */
  async cambiarPasswordUsuario(id: string, command: CambiarPasswordUsuarioCommand, ejecutadoPor: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const hashedPassword = await bcrypt.hash(command.password, SALT_ROUNDS);
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const usuarioActualizado = await tx.usuario.update({
        where: { id },
        data: { password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditoriaLog.create({
        data: {
          accion: `RESET_PASSWORD:por:${ejecutadoPor}`,
          usuarioId: id,
          servicio: 'servicio-identidad',
        },
      });
      return usuarioActualizado;
    });

    this.logger.log({
      operation: 'cambiarPasswordUsuario',
      aggregateId: actualizado.id,
      message: 'Contraseña de usuario reseteada por un administrador.',
    } satisfies OperableLog);
    return toUsuarioDto(actualizado);
  }

  /* ── Auditoría ─────────────────────────────────────── */

  async registrarAuditoria(accion: string, usuarioId: string, servicio: string, ip?: string) {
    await this.prisma.auditoriaLog.create({
      data: { accion, usuarioId, servicio, ip },
    });
  }

  /* ── Sedes (T-23: multi-sede, solo ADMIN) ──────────── */

  private toSedeDto(sede: { id: string; nombre: string; direccion: string | null; ruc: string | null; telefono: string | null; activa: boolean }): SedeDto {
    return { id: sede.id, nombre: sede.nombre, direccion: sede.direccion, ruc: sede.ruc, telefono: sede.telefono, activa: sede.activa };
  }

  async listarSedes(): Promise<{ sedes: SedeDto[] }> {
    const sedes = await this.prisma.sede.findMany({ orderBy: { nombre: 'asc' } });
    return { sedes: sedes.map((s) => this.toSedeDto(s)) };
  }

  // Sede a mostrar en el Sidebar (nombre + dirección bajo el nombre de marca).
  // A diferencia del resto de endpoints de sede (solo ADMIN), este lo puede
  // llamar cualquier usuario autenticado — todos necesitan ver su propia
  // sede, no solo el admin general. LENIENT a propósito (nunca lanza si no
  // hay sede resuelta): es un dato cosmético, no un recurso protegido.
  async sedeActual(usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ sede: SedeDto | null }> {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado ?? null;
    if (!sedeId) return { sede: null };
    const sede = await this.prisma.sede.findUnique({ where: { id: sedeId } });
    return { sede: sede ? this.toSedeDto(sede) : null };
  }

  // Carta pública/QR (T-XX): SIN autenticación, cualquiera con el link la
  // llama — por eso expone solo lo estrictamente necesario para el header de
  // la carta (ni ruc, ni activa) y no filtra por sede del llamante (no hay
  // llamante). Una sede desactivada devuelve null: el QR simplemente deja de
  // funcionar en vez de mostrar datos de un local que ya cerró.
  async sedePublica(sedeId: string): Promise<{ sede: SedePublicaDto | null }> {
    const sede = await this.prisma.sede.findUnique({ where: { id: sedeId } });
    if (!sede || !sede.activa) return { sede: null };
    return { sede: { id: sede.id, nombre: sede.nombre, direccion: sede.direccion, telefono: sede.telefono } };
  }

  // Consumido desde EventsController (turno.abierto / turno.cerrado): el
  // personal MESERO de la sede se activa solo al abrir caja y se desactiva
  // solo al cerrarla, para que no puedan operar fuera de un turno con caja.
  // updateMany es naturalmente idempotente (repetir el mismo evento no
  // cambia el resultado), así que no hace falta deduplicar por evento.
  async activarMeserosPorSede(sedeId: string, activo: boolean): Promise<number> {
    const { count } = await this.prisma.usuario.updateMany({
      where: { sedeId, rol: 'MESERO' },
      data: { activo },
    });
    this.logger.log({
      operation: 'activarMeserosPorSede',
      aggregateId: sedeId,
      resultingState: activo ? 'ACTIVOS' : 'INACTIVOS',
      message: `${count} usuario(s) MESERO ${activo ? 'activados' : 'desactivados'} (sede ${sedeId}).`,
    } satisfies OperableLog);
    return count;
  }

  async crearSede(command: CrearSedeCommand): Promise<{ message: string; sede: SedeDto }> {
    const existe = await this.prisma.sede.findUnique({ where: { nombre: command.nombre } });
    if (existe) throw new ConflictException(`Ya existe una sede llamada "${command.nombre}".`);

    const sede = await this.prisma.sede.create({
      data: { nombre: command.nombre, direccion: command.direccion, ruc: command.ruc, telefono: command.telefono },
    });

    this.logger.log({
      operation: 'crearSede',
      aggregateId: sede.id,
      message: `Sede "${sede.nombre}" creada.`,
    } satisfies OperableLog);
    return { message: 'Sede creada', sede: this.toSedeDto(sede) };
  }

  async actualizarSede(id: string, command: ActualizarSedeCommand): Promise<{ message: string; sede: SedeDto }> {
    const existe = await this.prisma.sede.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Sede no encontrada');

    if (command.nombre && command.nombre !== existe.nombre) {
      const duplicada = await this.prisma.sede.findUnique({ where: { nombre: command.nombre } });
      if (duplicada) throw new ConflictException(`Ya existe una sede llamada "${command.nombre}".`);
    }

    const sede = await this.prisma.sede.update({
      where: { id },
      data: { nombre: command.nombre, direccion: command.direccion, ruc: command.ruc, telefono: command.telefono, activa: command.activa },
    });

    return { message: 'Sede actualizada', sede: this.toSedeDto(sede) };
  }

  async eliminarSede(id: string): Promise<{ message: string }> {
    const existe = await this.prisma.sede.findUnique({ where: { id }, include: { _count: { select: { usuarios: true } } } });
    if (!existe) throw new NotFoundException('Sede no encontrada');
    if (existe._count.usuarios > 0) {
      throw new ConflictException(`No se puede eliminar: ${existe._count.usuarios} usuario(s) siguen asignados a esta sede.`);
    }

    await this.prisma.sede.delete({ where: { id } });
    return { message: 'Sede eliminada' };
  }
}
