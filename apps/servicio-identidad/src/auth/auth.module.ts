import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getJwtPrivateKey, getJwtPublicKey } from '@org/shared-auth';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EventsController } from './events.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Tokens de USUARIO firmados en RS256 con la clave privada (sólo identidad
    // la tiene). La pública se incluye para que este servicio también pueda
    // verificar (p.ej. /auth/me). Plan 2.1.
    JwtModule.registerAsync({
      useFactory: () => ({
        privateKey: getJwtPrivateKey(),
        publicKey: getJwtPublicKey(),
        signOptions: {
          algorithm: 'RS256',
          // Access corto (plan 1.4): el refresh token renueva la sesión.
          expiresIn: (process.env.JWT_EXPIRES_IN ||
            '15m') as JwtSignOptions['expiresIn'],
          issuer: 'nachopps-identidad',
        },
      }),
    }),
  ],
  controllers: [AuthController, EventsController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
