import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import type { Env } from './config/env.schema.js';

/**
 * Configurações globais da aplicação.
 * Ficam fora do main.ts para os testes e2e usarem exatamente
 * a mesma configuração da API de verdade.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Cabeçalhos de segurança HTTP (X-Content-Type-Options, HSTS etc.)
  app.use(helmet());

  // CORS só vale para navegadores. O app mobile não passa por ele.
  const origens = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({ origin: origens.length > 0 ? origens : false });

  // Todas as rotas ficam em /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
