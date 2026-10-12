import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EscopoLojaGuard } from './common/auth/escopo-loja.guard.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { PerfisGuard } from './common/auth/perfis.guard.js';
import { envSchema } from './config/env.schema.js';
import { ErpModule } from './connectors/erp/erp.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IntegracaoModule } from './modules/integracao/integracao.module.js';
import { LojasModule } from './modules/lojas/lojas.module.js';
import { SincronizacaoModule } from './modules/sincronizacao/sincronizacao.module.js';

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
    ErpModule, // o conector de ERP escolhido pela variável ERP_CONECTOR
    HealthModule,
    AuthModule,
    LojasModule,
    IntegracaoModule,
    SincronizacaoModule, // pull e push dos aparelhos (Etapa 6)
  ],
  providers: [
    // Guards globais, executados nesta ordem:
    // 1. limite de requisições  2. quem é você? (token)
    // 3. seu perfil pode?       4. você tem acesso a esta loja?
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
    { provide: APP_GUARD, useClass: EscopoLojaGuard },
  ],
})
export class AppModule {}
