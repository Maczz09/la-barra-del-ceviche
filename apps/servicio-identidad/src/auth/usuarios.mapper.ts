import { UsuarioDto, RolUsuario } from '@org/contracts';
import { Usuario } from '../generated/prisma';

/** Traduce entidad Prisma → DTO de contrato (nunca expone password). */
export function toUsuarioDto(usuario: Usuario): UsuarioDto {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol as RolUsuario,
    activo: usuario.activo,
    sedeId: usuario.sedeId ?? null,
    telefono: usuario.telefono ?? null,
    createdAt: usuario.createdAt.toISOString(),
  };
}
