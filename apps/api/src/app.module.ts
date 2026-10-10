import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema.js';
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
    HealthModule,
  ],
})
export class AppModule {}
