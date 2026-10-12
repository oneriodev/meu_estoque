import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PapelUsuario } from '@meu-estoque/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

// Estes testes precisam do PostgreSQL rodando (docker compose up -d).
// A sincronização grava o catálogo FICTÍCIO no banco de desenvolvimento,
// que é exatamente o que queremos ter lá.

describe('Sincronização do catálogo com o ERP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sufixo = randomUUID().slice(0, 8);
  const tokens = { admin: '', operador: '' };
  const eanAntigo = `TESTE${sufixo}`;

  const sincronizar = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/integracao/erp/sincronizar')
      .set('Authorization', `Bearer ${token}`);

  async function criarToken(papel: PapelUsuario): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        login: `e2e.sync.${papel.toLowerCase()}.${sufixo}`,
        nome: papel,
        papel,
        senhaHash: 'x',
      },
    });
    return app.get(JwtService).signAsync({ sub: usuario.id, papel });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Garante que a loja 01 existe (o seed normalmente já criou)
    await prisma.loja.upsert({
      where: { codigo: '01' },
      update: {},
      create: { codigo: '01', nome: 'Loja 01 - Matriz' },
    });
    tokens.admin = await criarToken('ADMINISTRADOR');
    tokens.operador = await criarToken('OPERADOR');
  });

  afterAll(async () => {
    await prisma.ean.deleteMany({ where: { codigo: eanAntigo } });
    await prisma.usuario.deleteMany({ where: { login: { endsWith: `.${sufixo}` } } });
    await app.close();
  });

  it('operador não pode sincronizar (403)', async () => {
    await sincronizar(tokens.operador).expect(403);
  });

  it('administrador sincroniza e recebe o resumo', async () => {
    const { body } = await sincronizar(tokens.admin).expect(200);
    expect(body).toMatchObject({
      conector: 'consinco-simulado',
      categorias: 10,
      produtos: 34,
      eans: 51,
      ignorados: 0,
    });
    expect(body.posicoes).toBeGreaterThanOrEqual(34);
  });

  it('sincronizar de novo sem mudanças no ERP não regrava nada', async () => {
    await sincronizar(tokens.admin).expect(200);
    const arroz = () => prisma.produto.findUniqueOrThrow({ where: { codigoErp: '10001' } });
    const antes = await arroz();

    const { body } = await sincronizar(tokens.admin).expect(200);

    expect(body.alterados).toBe(0);
    // atualizadoEm intacto: os aparelhos não vão baixar o catálogo inteiro de novo
    expect((await arroz()).atualizadoEm).toEqual(antes.atualizadoEm);
  });

  it('é idempotente: sincronizar de novo não duplica nada', async () => {
    const contar = () =>
      Promise.all([prisma.categoria.count(), prisma.produto.count(), prisma.ean.count()]);

    await sincronizar(tokens.admin).expect(200);
    const antes = await contar();
    await sincronizar(tokens.admin).expect(200);
    expect(await contar()).toEqual(antes);
  });

  it('grava produto, EANs e preço por loja como texto exato', async () => {
    const arroz = await prisma.produto.findUniqueOrThrow({
      where: { codigoErp: '10001' },
      include: {
        eans: { where: { excluidoEm: null } },
        lojas: { where: { loja: { codigo: '01' } } },
        categoria: { include: { pai: true } },
      },
    });

    expect(arroz.descricao).toBe('Arroz tipo 1 5kg');
    expect(arroz.eans).toHaveLength(2); // unidade e caixa
    expect(arroz.lojas[0]?.preco.toString()).toBe('28.79');
    expect(arroz.categoria.pai?.nome).toBe('Mercearia'); // hierarquia ligada
  });

  it('EAN que saiu do ERP é marcado como excluído (exclusão lógica)', async () => {
    const arroz = await prisma.produto.findUniqueOrThrow({ where: { codigoErp: '10001' } });
    // Simula um EAN antigo que existia no nosso banco mas o ERP não lista mais
    await prisma.ean.create({ data: { codigo: eanAntigo, produtoId: arroz.id } });

    await sincronizar(tokens.admin).expect(200);

    const antigo = await prisma.ean.findUniqueOrThrow({ where: { codigo: eanAntigo } });
    expect(antigo.excluidoEm).not.toBeNull();
  });
});
