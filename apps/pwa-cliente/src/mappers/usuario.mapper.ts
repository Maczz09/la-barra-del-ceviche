import type { RolUsuario, UsuarioDto, UsuarioVM } from '../types/usuario.types';

const ROLE_LABELS: Record<RolUsuario, string> = {
  ADMIN: 'Admin',
  CAJERO: 'Cajero',
  COCINA: 'Cocina',
  MESERO: 'Mesero',
  RECEPCION: 'Recepción',
  GERENCIA: 'Gerencia',
  SISTEMA: 'Sistema',
};

export function mapUsuario(dto: UsuarioDto): UsuarioVM {
  return {
    id: dto.id,
    nombre: dto.nombre,
    email: dto.email,
    rol: dto.rol,
    rolLabel: ROLE_LABELS[dto.rol] ?? dto.rol,
    activo: dto.activo,
    estadoLabel: dto.activo ? 'Activo' : 'Inactivo',
    estadoClass: dto.activo ? 'badge-ok' : 'badge-muted',
    createdAt: dto.createdAt,
    createdAtLabel: new Date(dto.createdAt).toLocaleDateString(),
    sedeId: dto.sedeId ?? null,
    telefono: dto.telefono ?? null,
  };
}

export function mapUsuarios(dtos: UsuarioDto[]): UsuarioVM[] {
  return dtos.map(mapUsuario);
}
