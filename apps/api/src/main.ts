import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app);

  // Documentação aberta só em desenvolvimento: em produção ela
  // entregaria o mapa da API para qualquer curioso
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  // Fecha conexões com calma ao receber Ctrl+C ou o "stop" do Docker
  app.enableShutdownHooks();

  await app.listen(config.get('API_PORT', { infer: true }));
}

await bootstrap();
