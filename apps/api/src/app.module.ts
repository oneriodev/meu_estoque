import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { envSchema } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // o ConfigService fica disponível em todos os módulos
      // O npm roda a API dentro de apps/api, mas o .env fica na raiz do monorepo
      envFilePath: ['.env', '../../.env'],
      // Em produção, as variáveis vêm do servidor, não de arquivo
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validationSchema: envSchema,
    }),
    // Limite geral: 100 requisições por minuto por IP (o login tem um limite próprio, menor)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Guards globais, na ordem: primeiro o limite de requisições, depois o login
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
