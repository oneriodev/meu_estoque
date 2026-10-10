import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app); // mesmo prefixo, versão e segurança da API real
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Este teste precisa do PostgreSQL rodando (docker compose up -d)
  it('GET /api/v1/health responde ok', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(resposta.body.status).toBe('ok');
    expect(resposta.body.banco).toBe('ok');
  });

  it('envia cabeçalhos de segurança do helmet', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/v1/health');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rota antiga sem prefixo não existe mais', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
