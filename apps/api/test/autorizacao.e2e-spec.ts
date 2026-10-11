import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PapelUsuario } from '@meu-estoque/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SenhaService } from '../src/modules/auth/senha.service.js';

// Estes testes precisam do PostgreSQL rodando (docker compose up -d)

async function criarApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/**
 * Cenário próprio dos testes: duas lojas (A e B) e um usuário de cada perfil.
 * Tudo com sufixo aleatório, criado no início e apagado no final.
 */
describe('Autorização por perfil e por loja (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sufixo = randomUUID().slice(0, 8);
  const ids = { lojaA: '', lojaB: '' };
  const tokens: Record<'operadorA' | 'supervisorA' | 'admin', string> = {
    operadorA: '',
    supervisorA: '',
    admin: '',
  };

  async function criarUsuario(nome: string, papel: PapelUsuario, lojaId?: string): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        login: `e2e.${nome}.${sufixo}`,
        nome,
        papel,
        senhaHash: await app.get(SenhaService).gerarHash('nao-usada-nestes-testes'),
        lojas: lojaId ? { create: { lojaId } } : undefined,
      },
    });
    // Token gerado direto (sem passar pelo login), para não esbarrar no limite de tentativas
    return app.get(JwtService).signAsync({ sub: usuario.id, papel });
  }

  beforeAll(async () => {
    app = await criarApp();
    prisma = app.get(PrismaService);
    ids.lojaA = (await prisma.loja.create({ data: { codigo: `A-${sufixo}`, nome: 'Loja A' } })).id;
    ids.lojaB = (await prisma.loja.create({ data: { codigo: `B-${sufixo}`, nome: 'Loja B' } })).id;
    tokens.operadorA = await criarUsuario('operadorA', 'OPERADOR', ids.lojaA);
    tokens.supervisorA = await criarUsuario('supervisorA', 'SUPERVISOR', ids.lojaA);
    tokens.admin = await criarUsuario('admin', 'ADMINISTRADOR');
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { login: { endsWith: `.${sufixo}` } } });
    await prisma.loja.deleteMany({ where: { id: { in: [ids.lojaA, ids.lojaB] } } });
    await app.close();
  });

  const get = (caminho: string, token: string) =>
    request(app.getHttpServer()).get(caminho).set('Authorization', `Bearer ${token}`);

  it('operador acessa a própria loja', async () => {
    await get(`/api/v1/lojas/${ids.lojaA}`, tokens.operadorA).expect(200);
  });

  it('operador NÃO acessa outra loja (403)', async () => {
    await get(`/api/v1/lojas/${ids.lojaB}`, tokens.operadorA).expect(403);
  });

  it('operador NÃO vê a equipe, nem da própria loja (perfil, 403)', async () => {
    await get(`/api/v1/lojas/${ids.lojaA}/equipe`, tokens.operadorA).expect(403);
  });

  it('supervisor vê a equipe da própria loja', async () => {
    const resposta = await get(`/api/v1/lojas/${ids.lojaA}/equipe`, tokens.supervisorA).expect(200);
    expect(resposta.body).toHaveLength(2); // operadorA e supervisorA
    expect(resposta.body[0]).not.toHaveProperty('login'); // LGPD: só o necessário
  });

  it('supervisor NÃO vê a equipe de outra loja (403)', async () => {
    await get(`/api/v1/lojas/${ids.lojaB}/equipe`, tokens.supervisorA).expect(403);
  });

  it('administrador acessa qualquer loja', async () => {
    await get(`/api/v1/lojas/${ids.lojaB}/equipe`, tokens.admin).expect(200);
  });

  it('identificador de loja inválido responde 400', async () => {
    await get('/api/v1/lojas/nao-e-um-uuid', tokens.admin).expect(400);
  });

  it('loja inexistente responde 404 para o administrador', async () => {
    await get(`/api/v1/lojas/${randomUUID()}`, tokens.admin).expect(404);
  });
});

describe('Refresh token e logout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const login = `e2e.refresh.${randomUUID().slice(0, 8)}`;
  const senha = 'senha-de-teste-refresh';

  const entrar = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login, senha, dispositivo: 'Tablet de teste' })
      .expect(200);

  const renovar = (refreshToken: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    app = await criarApp();
    prisma = app.get(PrismaService);
    await prisma.usuario.create({
      data: {
        login,
        nome: 'Usuário Refresh',
        papel: 'OPERADOR',
        senhaHash: await app.get(SenhaService).gerarHash(senha),
      },
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { login } }); // apaga as sessões junto (Cascade)
    await app.close();
  });

  it('o login devolve refresh token e o banco guarda só o hash', async () => {
    const { body } = await entrar();
    expect(body.refreshToken).toEqual(expect.any(String));

    const sessao = await prisma.sessaoRefresh.findFirstOrThrow({
      where: { usuario: { login } },
      orderBy: { criadoEm: 'desc' },
    });
    expect(sessao.tokenHash).not.toBe(body.refreshToken);
    expect(sessao.dispositivo).toBe('Tablet de teste');
  });

  it('renova os tokens e o refresh antigo deixa de valer', async () => {
    const { body: login1 } = await entrar();
    const { body: renovado } = await renovar(login1.refreshToken).expect(200);

    expect(renovado.refreshToken).not.toBe(login1.refreshToken);
    // O novo access token funciona
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${renovado.accessToken}`)
      .expect(200);
  });

  it('reutilizar um refresh antigo derruba a sessão inteira', async () => {
    const { body: login1 } = await entrar();
    const { body: renovado } = await renovar(login1.refreshToken).expect(200);

    // Alguém tenta usar o token antigo (como faria quem o copiou)
    await renovar(login1.refreshToken).expect(401);
    // Consequência: até o token mais novo foi revogado
    await renovar(renovado.refreshToken).expect(401);
  });

  it('depois do logout, o refresh token não renova mais', async () => {
    const { body } = await entrar();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: body.refreshToken })
      .expect(204);
    await renovar(body.refreshToken).expect(401);
  });
});
