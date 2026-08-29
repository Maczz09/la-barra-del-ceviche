import { SetMetadata } from '@nestjs/common';

/** Clave de metadata que marca un endpoint como público (sin JWT). */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como público: {@link JwtAuthGuard} lo deja pasar sin
 * validar token. Para uso en endpoints de solo lectura sin datos sensibles
 * (p. ej. la carta pública) — el propio handler debe filtrar qué expone.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
