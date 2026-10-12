import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PapelUsuario, PullResponse } from '@meu-estoque/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SincronizacaoCatalogoService } from '../src/modules/integracao/sincronizacao-catalogo.service.js';

// Precisa do PostgreSQL rodando (docker compose up -d). Usa o catálogo FICTÍCIO do simulador.

/** O pull só entrega o que mudou até 2 s atrás (horizonte): esperamos um pouco mais que isso. */
const esperarHorizonte = () => new Promise((resolve) => setTimeout(resolve, 2_200));

describe('Sincronização com os aparelhos: pull e push (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sufixo = randomUUID().slice(0, 8);
  const lojas = { l01: '', l02: '' };
  const tokens = { operador01: '', supervisor02: '', admin: '' };
  const usuarios = { operador01: '' };

  const servidor = () => app.getHttpServer();
  const pull = (lojaId: string, token: string, query: Record<string, string | number> = {}) =>
    request(servidor())
      .get(`/api/v1/lojas/${lojaId}/sincronizacao/alteracoes`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  const push = (lojaId: string, token: string, eventos: unknown[]) =>
    request(servidor())
      .post(`/api/v1/lojas/${lojaId}/sincronizacao/eventos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventos });

  /** Faz o pull página por página até temMais = false, como o app fará. */
  async function pullCompleto(lojaId: string, token: string, cursor?: string, limite = 25) {
    const total = { categorias: 0, produtos: 0, eans: 0, produtosLoja: 0, lotes: 0 };
    let paginas = 0;
    let resposta: PullResponse;
    do {
      const { body } = await pull(lojaId, token, { limite, ...(cursor && { cursor }) }).expect(200);
      resposta = body as PullResponse;
      for (const chave of Object.keys(total) as (keyof typeof total)[]) {
        total[chave] += resposta.alteracoes[chave].length;
        // Nenhuma página passa do limite pedido
      }
      expect(Object.values(resposta.alteracoes).flat().length).toBeLessThanOrEqual(limite);
      cursor = resposta.cursor;
      paginas++;
    } while (resposta.temMais && paginas < 100);
    return { total, cursor: resposta.cursor, paginas };
  }

  async function criarUsuario(papel: PapelUsuario, lojaId?: string) {
    const usuario = await prisma.usuario.create({
      data: {
        login: `e2e.aparelho.${papel.toLowerCase()}.${randomUUID().slice(0, 6)}.${sufixo}`,
        nome: papel,
        papel,
        senhaHash: 'x',
        ...(lojaId && { lojas: { create: { lojaId } } }),
      },
    });
    const token = await app.get(JwtService).signAsync({ sub: usuario.id, papel });
    return { id: usuario.id, token };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const [chave, codigo] of [
      ['l01', '01'],
      ['l02', '02'],
    ] as const) {
      const loja = await prisma.loja.upsert({
        where: { codigo },
        update: {},
        create: { codigo, nome: `Loja ${codigo}` },
      });
      lojas[chave] = loja.id;
    }

    // Catálogo fictício no banco (só grava o que mudou)
    await app.get(SincronizacaoCatalogoService).sincronizarTudo();

    const operador = await criarUsuario('OPERADOR', lojas.l01);
    usuarios.operador01 = operador.id;
    tokens.operador01 = operador.token;
    tokens.supervisor02 = (await criarUsuario('SUPERVISOR', lojas.l02)).token;
    tokens.admin = (await criarUsuario('ADMINISTRADOR')).token;

    await esperarHorizonte();
  });

  afterAll(async () => {
    const filtroUsuario = { usuario: { login: { endsWith: `.${sufixo}` } } };
    await prisma.eventoRecebido.deleteMany({ where: filtroUsuario });
    await prisma.lote.deleteMany({ where: { codigo: { startsWith: `E2E${sufixo}` } } });
    await prisma.usuario.deleteMany({ where: { login: { endsWith: `.${sufixo}` } } });
    // Desfaz a alteração de preço do teste (o simulador devolve o preço original)
    await app.get(SincronizacaoCatalogoService).sincronizarTudo();
    await app.close();
  });

  describe('pull', () => {
    it('a carga inicial traz o catálogo inteiro e as posições SÓ da loja', async () => {
      const { total, paginas } = await pullCompleto(lojas.l01, tokens.operador01);

      const ate = new Date(Date.now() - 2_000);
      expect(total.categorias).toBe(
        await prisma.categoria.count({ where: { atualizadoEm: { lte: ate } } }),
      );
      expect(total.produtos).toBe(
        await prisma.produto.count({ where: { atualizadoEm: { lte: ate } } }),
      );
      expect(total.eans).toBe(await prisma.ean.count({ where: { atualizadoEm: { lte: ate } } }));
      expect(total.produtosLoja).toBe(
        await prisma.produtoLoja.count({
          where: { lojaId: lojas.l01, atualizadoEm: { lte: ate } },
        }),
      );
      expect(paginas).toBeGreaterThan(1); // com limite 25, precisou paginar
    });

    it('dinheiro e quantidades chegam como texto exato', async () => {
      const { body } = await pull(lojas.l01, tokens.operador01, { limite: 1000 }).expect(200);
      const arroz = (body as PullResponse).alteracoes.produtos.find((p) => p.codigoErp === '10001');
      const posicao = (body as PullResponse).alteracoes.produtosLoja.find(
        (p) => p.produtoId === arroz?.id,
      );
      expect(posicao?.preco).toBe('28.79');
      expect(posicao?.saldo).toMatch(/^-?\d+\.\d{3}$/);
    });

    it('com o cursor final, o próximo pull vem vazio; depois traz SÓ o que mudou', async () => {
      const { cursor } = await pullCompleto(lojas.l01, tokens.operador01);

      const vazio = await pullCompleto(lojas.l01, tokens.operador01, cursor);
      expect(Object.values(vazio.total).every((n) => n === 0)).toBe(true);

      // O ERP mudou o preço de um produto
      const arroz = await prisma.produto.findUniqueOrThrow({ where: { codigoErp: '10001' } });
      await prisma.produtoLoja.update({
        where: { produtoId_lojaId: { produtoId: arroz.id, lojaId: lojas.l01 } },
        data: { preco: '29.99' },
      });
      await esperarHorizonte();

      const { body } = await pull(lojas.l01, tokens.operador01, { cursor: vazio.cursor }).expect(
        200,
      );
      const resposta = body as PullResponse;
      expect(resposta.alteracoes.produtosLoja).toEqual([
        expect.objectContaining({ produtoId: arroz.id, preco: '29.99' }),
      ]);
      expect(resposta.alteracoes.produtos).toHaveLength(0);
      expect(resposta.temMais).toBe(false);
    });

    it('lote excluído chega com excluido = true e validade só com a data', async () => {
      const { cursor } = await pullCompleto(lojas.l01, tokens.operador01);
      const arroz = await prisma.produto.findUniqueOrThrow({ where: { codigoErp: '10001' } });
      const lote = await prisma.lote.create({
        data: {
          produtoId: arroz.id,
          lojaId: lojas.l01,
          codigo: `E2E${sufixo}`,
          validade: new Date('2026-11-30'),
        },
      });
      await esperarHorizonte();

      const criado = await pull(lojas.l01, tokens.operador01, { cursor }).expect(200);
      expect(criado.body.alteracoes.lotes).toEqual([
        expect.objectContaining({ id: lote.id, validade: '2026-11-30', excluido: false }),
      ]);

      await prisma.lote.update({ where: { id: lote.id }, data: { excluidoEm: new Date() } });
      await esperarHorizonte();

      const excluido = await pull(lojas.l01, tokens.operador01, {
        cursor: criado.body.cursor,
      }).expect(200);
      expect(excluido.body.alteracoes.lotes).toEqual([
        expect.objectContaining({ id: lote.id, excluido: true }),
      ]);
    });

    it('o pull da loja 02 não traz lotes da loja 01', async () => {
      const { body } = await pull(lojas.l02, tokens.supervisor02, { limite: 1000 }).expect(200);
      const lotesDaLoja01 = await prisma.lote.findMany({
        where: { lojaId: lojas.l01 },
        select: { id: true },
      });
      const ids = new Set(lotesDaLoja01.map((l) => l.id));
      expect((body as PullResponse).alteracoes.lotes.some((l) => ids.has(l.id))).toBe(false);
    });

    it('operador NÃO faz pull de outra loja (403)', async () => {
      await pull(lojas.l02, tokens.operador01).expect(403);
    });

    it('cursor adulterado responde 400', async () => {
      await pull(lojas.l01, tokens.operador01, { cursor: 'nao-e-um-cursor' }).expect(400);
    });

    it('cursor de outra loja responde 400 (o app deve recomeçar a carga)', async () => {
      const { body } = await pull(lojas.l01, tokens.admin).expect(200);
      await pull(lojas.l02, tokens.admin, { cursor: body.cursor }).expect(400);
    });

    it('limite acima do máximo responde 400', async () => {
      await pull(lojas.l01, tokens.operador01, { limite: 5000 }).expect(400);
    });

    it('sem token responde 401', async () => {
      await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/sincronizacao/alteracoes`)
        .expect(401);
    });
  });

  describe('push (outbox)', () => {
    const diagnostico = (mensagem: string) => ({
      id: randomUUID(),
      tipo: 'DIAGNOSTICO',
      ocorridoEm: new Date().toISOString(),
      dados: { mensagem },
    });

    it('aplica o evento e registra quem enviou, de qual loja', async () => {
      const evento = diagnostico('teste de fila');
      const { body } = await push(lojas.l01, tokens.operador01, [evento]).expect(200);

      expect(body.resultados).toEqual([{ id: evento.id, status: 'APLICADO' }]);
      const registro = await prisma.eventoRecebido.findUniqueOrThrow({ where: { id: evento.id } });
      expect(registro).toMatchObject({
        lojaId: lojas.l01,
        usuarioId: usuarios.operador01,
        resultado: 'APLICADO',
      });
    });

    it('é idempotente: o reenvio volta como DUPLICADO e não grava de novo', async () => {
      const evento = diagnostico('enviado duas vezes');
      await push(lojas.l01, tokens.operador01, [evento]).expect(200);
      const { body } = await push(lojas.l01, tokens.operador01, [evento]).expect(200);

      expect(body.resultados).toEqual([{ id: evento.id, status: 'DUPLICADO' }]);
      expect(await prisma.eventoRecebido.count({ where: { id: evento.id } })).toBe(1);
    });

    it('um evento inválido é rejeitado sozinho e não trava os outros', async () => {
      const valido1 = diagnostico('antes');
      const invalido = { ...diagnostico(''), dados: { mensagem: '' } };
      const desconhecido = { ...diagnostico('x'), tipo: 'TIPO_QUE_NAO_EXISTE' };
      const valido2 = diagnostico('depois');

      const { body } = await push(lojas.l01, tokens.operador01, [
        valido1,
        invalido,
        desconhecido,
        valido2,
      ]).expect(200);

      expect(body.resultados.map((r: { status: string }) => r.status)).toEqual([
        'APLICADO',
        'REJEITADO',
        'REJEITADO',
        'APLICADO',
      ]);
      expect(body.resultados[1].motivo).toContain('Dados inválidos');
      expect(body.resultados[2].motivo).toContain('desconhecido');
    });

    it('o mesmo id enviado por OUTRO usuário é rejeitado sem revelar nada', async () => {
      const evento = diagnostico('meu evento');
      await push(lojas.l01, tokens.operador01, [evento]).expect(200);

      const { body } = await push(lojas.l02, tokens.supervisor02, [evento]).expect(200);
      expect(body.resultados[0]).toMatchObject({ status: 'REJEITADO' });
    });

    it('operador NÃO envia eventos para outra loja (403)', async () => {
      await push(lojas.l02, tokens.operador01, [diagnostico('loja errada')]).expect(403);
    });

    it('envelope malformado responde 400 (lote inteiro recusado)', async () => {
      await push(lojas.l01, tokens.operador01, [{ id: 'nao-e-uuid', tipo: 'DIAGNOSTICO' }]).expect(
        400,
      );
      await push(lojas.l01, tokens.operador01, []).expect(400);
    });
  });
});
