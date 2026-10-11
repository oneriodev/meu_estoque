import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SenhaService } from './senha.service.js';
import { SessaoService } from './sessao.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true, // o JwtAuthGuard global também precisa do JwtService
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL_SEGUNDOS', { infer: true }),
          algorithm: 'HS256',
        },
        // Só aceita tokens assinados com HS256: bloqueia o truque do "alg: none"
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SenhaService, SessaoService],
  exports: [SenhaService],
})
export class AuthModule {}
