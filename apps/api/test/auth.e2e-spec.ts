import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SenhaService } from '../src/modules/auth/senha.service.js';

// Estes testes precisam do PostgreSQL rodando (docker compose up -d)

/** Sobe a aplicação completa, com a mesma configuração da API real. */
async function criarApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Usuário temporário, criado só para os testes e apagado no final
  const login = `e2e.${randomUUID().slice(0, 8)}`;
  const senha = 'senha-de-teste-e2e';
  let token = '';

  beforeAll(async () => {
    app = await criarApp();
    prisma = app.get(PrismaService);
    const senhaHash = await app.get(SenhaService).gerarHash(senha);
    await prisma.usuario.create({
      data: { login, nome: 'Operador de Teste', senhaHash, papel: 'OPERADOR' },
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { login } });
    await app.close();
  });

  it('faz login e devolve o token e a sessão', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: login.toUpperCase(), senha }) // o login não diferencia maiúsculas
      .expect(200);

    expect(resposta.body.accessToken).toEqual(expect.any(String));
    expect(resposta.body.usuario.papel).toBe('OPERADOR');
    expect(resposta.body.usuario).not.toHaveProperty('senhaHash'); // o hash nunca sai da API
    token = resposta.body.accessToken;
  });

  it('recusa senha errada com mensagem genérica', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login, senha: 'senha-errada' })
      .expect(401);
    expect(resposta.body.message).toBe('Login ou senha inválidos');
  });

  it('login inexistente recebe a MESMA mensagem (não revela quem existe)', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'ninguem.existe', senha: 'qualquer' })
      .expect(401);
    expect(resposta.body.message).toBe('Login ou senha inválidos');
  });

  it('valida o corpo com o schema do packages/shared', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ login: 'ab' }).expect(400);
  });

  it('rota protegida sem token responde 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rota protegida com token devolve a sessão', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(resposta.body.nome).toBe('Operador de Teste');
  });

  it('token adulterado responde 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token.slice(0, -1)}x`)
      .expect(401);
  });
});

describe('Limite de tentativas de login (e2e)', () => {
  let app: INestApplication;

  // App novo: o contador de tentativas começa zerado
  beforeAll(async () => {
    app = await criarApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia a 6ª tentativa no mesmo minuto com 429', async () => {
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ login: 'ninguem.existe', senha: 'x' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'ninguem.existe', senha: 'x' })
      .expect(429);
  });
});
