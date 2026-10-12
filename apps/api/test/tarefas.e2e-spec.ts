import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  AcaoTarefa,
  PapelUsuario,
  PullResponse,
  TarefaDetalhe,
  TarefaResumo,
} from '@meu-estoque/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SincronizacaoCatalogoService } from '../src/modules/integracao/sincronizacao-catalogo.service.js';

// Precisa do PostgreSQL rodando (docker compose up -d).

interface Usuario {
  id: string;
  token: string;
}

describe('Motor de tarefas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sufixo = randomUUID().slice(0, 8);
  const lojas = { l01: '', l02: '' };
  let produtoId = '';
  // operadorA e operadorB na loja 01, operadorOutraLoja na 02, supervisor na 01
  const u = {} as Record<'operadorA' | 'operadorB' | 'operadorOutraLoja' | 'supervisor', Usuario>;

  const servidor = () => app.getHttpServer();

  /** Envia eventos pela outbox, como o app faz. Devolve o resultado de cada um. */
  async function enviar(quem: Usuario, lojaId: string, eventos: object[]) {
    const { body } = await request(servidor())
      .post(`/api/v1/lojas/${lojaId}/sincronizacao/eventos`)
      .set('Authorization', `Bearer ${quem.token}`)
      .send({ eventos })
      .expect(200);
    return body.resultados as {
      id: string;
      status: string;
      motivo?: string;
      tarefa?: TarefaResumo;
    }[];
  }

  const evento = (tipo: string, dados: object) => ({
    id: randomUUID(),
    tipo,
    ocorridoEm: new Date().toISOString(),
    dados,
  });

  /** Uma ação sobre a tarefa, enviada pelo usuário; devolve o resultado. */
  async function agir(
    quem: Usuario,
    tarefaId: string,
    acao: AcaoTarefa,
    motivo?: string,
    lojaId = lojas.l01,
  ) {
    const [resultado] = await enviar(quem, lojaId, [
      evento('TAREFA_ACAO', { tarefaId, acao, ...(motivo && { motivo }) }),
    ]);
    return resultado!;
  }

  /** O operador cria a tarefa no aparelho (id gerado lá) e ela chega pela outbox. */
  async function criarPeloAparelho(quem: Usuario, tipo = 'REPOSICAO') {
    const tarefaId = randomUUID();
    const [resultado] = await enviar(quem, lojas.l01, [
      evento('TAREFA_CRIADA', { tarefaId, tipo, titulo: `Repor arroz ${sufixo}`, produtoId }),
    ]);
    return { tarefaId, resultado: resultado! };
  }

  const detalhe = async (quem: Usuario, tarefaId: string) =>
    (
      await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/tarefas/${tarefaId}`)
        .set('Authorization', `Bearer ${quem.token}`)
        .expect(200)
    ).body as TarefaDetalhe;

  async function criarUsuario(nome: string, papel: PapelUsuario, lojaId: string): Promise<Usuario> {
    const usuario = await prisma.usuario.create({
      data: {
        login: `e2e.tarefas.${randomUUID().slice(0, 6)}.${sufixo}`,
        nome,
        papel,
        senhaHash: 'x',
        lojas: { create: { lojaId } },
      },
    });
    return {
      id: usuario.id,
      token: await app.get(JwtService).signAsync({ sub: usuario.id, papel }),
    };
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
    await app.get(SincronizacaoCatalogoService).sincronizarTudo();
    produtoId = (await prisma.produto.findUniqueOrThrow({ where: { codigoErp: '10001' } })).id;

    u.operadorA = await criarUsuario(`Operador A ${sufixo}`, 'OPERADOR', lojas.l01);
    u.operadorB = await criarUsuario(`Operador B ${sufixo}`, 'OPERADOR', lojas.l01);
    u.operadorOutraLoja = await criarUsuario(`Operador C ${sufixo}`, 'OPERADOR', lojas.l02);
    u.supervisor = await criarUsuario(`Supervisor ${sufixo}`, 'SUPERVISOR', lojas.l01);
  });

  afterAll(async () => {
    const dosTestes = { usuario: { login: { endsWith: `.${sufixo}` } } };
    const tarefas = { where: { titulo: { contains: sufixo } } };
    await prisma.eventoRecebido.deleteMany({ where: dosTestes });
    // O histórico é imutável (um gatilho no banco bloqueia UPDATE e DELETE).
    // Só aqui, para limpar os dados de TESTE, o gatilho é desligado dentro de uma transação.
    await prisma.$transaction([
      prisma.$executeRaw`ALTER TABLE tarefa_eventos DISABLE TRIGGER USER`,
      prisma.tarefaEvento.deleteMany({ where: { tarefa: tarefas.where } }),
      prisma.$executeRaw`ALTER TABLE tarefa_eventos ENABLE TRIGGER USER`,
    ]);
    await prisma.tarefa.deleteMany(tarefas);
    await prisma.usuario.deleteMany({ where: { login: { endsWith: `.${sufixo}` } } });
    await app.close();
  });

  describe('criação', () => {
    it('o gestor cria pela API; o operador não', async () => {
      const corpo = { tipo: 'MANUAL', titulo: `Organizar ilha ${sufixo}` };
      const { body } = await request(servidor())
        .post(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .set('Authorization', `Bearer ${u.supervisor.token}`)
        .send(corpo)
        .expect(201);
      expect(body).toMatchObject({ status: 'GERADA', origem: 'MANUAL', responsavelId: null });

      await request(servidor())
        .post(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .set('Authorization', `Bearer ${u.operadorA.token}`)
        .send(corpo)
        .expect(403);
    });

    it('o operador cria no aparelho (id gerado lá); o reenvio não duplica', async () => {
      const tarefaId = randomUUID();
      const criar = evento('TAREFA_CRIADA', {
        tarefaId,
        tipo: 'RUPTURA',
        titulo: `Gôndola vazia ${sufixo}`,
        produtoId,
      });
      expect((await enviar(u.operadorA, lojas.l01, [criar]))[0]).toMatchObject({
        status: 'APLICADO',
      });
      expect((await enviar(u.operadorA, lojas.l01, [criar]))[0]).toMatchObject({
        status: 'DUPLICADO',
      });

      const tarefa = await detalhe(u.operadorA, tarefaId);
      expect(tarefa).toMatchObject({ id: tarefaId, tipo: 'RUPTURA', status: 'GERADA', produtoId });
      expect(tarefa.eventos).toHaveLength(1); // o "nascimento" também fica no histórico
    });

    it('operador não abre tarefa de contagem (decisão do gestor)', async () => {
      const { resultado } = await criarPeloAparelho(u.operadorA, 'CONTAGEM');
      expect(resultado).toMatchObject({
        status: 'REJEITADO',
        motivo: expect.stringContaining('gestor'),
      });
    });
  });

  describe('ciclo de vida', () => {
    it('aceitar → iniciar → concluir, com histórico de quem fez cada etapa', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);

      for (const acao of ['ACEITAR', 'INICIAR', 'CONCLUIR'] as const) {
        expect(await agir(u.operadorA, tarefaId, acao)).toMatchObject({ status: 'APLICADO' });
      }

      const tarefa = await detalhe(u.supervisor, tarefaId);
      expect(tarefa).toMatchObject({ status: 'CONCLUIDA', responsavelId: u.operadorA.id });
      expect(tarefa.eventos.map((e) => e.statusNovo)).toEqual([
        'GERADA',
        'ACEITA',
        'EM_EXECUCAO',
        'CONCLUIDA',
      ]);
      expect(tarefa.eventos[1]?.usuarioNome).toBe(`Operador A ${sufixo}`);
    });

    it('transição inválida é recusada com mensagem para o operador', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      expect(await agir(u.operadorA, tarefaId, 'CONCLUIR')).toMatchObject({
        status: 'REJEITADO',
        motivo: 'Não é possível concluir uma tarefa pendente',
      });
    });

    it('conflito offline: dois aceitam a mesma tarefa, o primeiro a chegar fica com ela', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      const primeiro = await agir(u.operadorA, tarefaId, 'ACEITAR');
      // A resposta já traz a tarefa como ficou: o aparelho não espera o próximo pull
      expect(primeiro).toMatchObject({
        status: 'APLICADO',
        tarefa: { id: tarefaId, status: 'ACEITA', responsavelId: u.operadorA.id },
      });

      const segundo = await agir(u.operadorB, tarefaId, 'ACEITAR');
      expect(segundo.status).toBe('REJEITADO');
      expect(segundo.motivo).toContain(`Operador A ${sufixo}`); // diz com quem está
      // Recusado, mas com o estado real: o aparelho do B mostra na hora que está com o A
      expect(segundo.tarefa).toMatchObject({ status: 'ACEITA', responsavelId: u.operadorA.id });
    });

    it('cancelar e impedir exigem motivo', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      expect((await agir(u.operadorA, tarefaId, 'CANCELAR')).motivo).toContain('motivo');

      await agir(u.operadorA, tarefaId, 'ACEITAR');
      expect(
        await agir(u.operadorA, tarefaId, 'IMPEDIR', 'Produto não encontrado no depósito'),
      ).toMatchObject({ status: 'APLICADO' });

      const tarefa = await detalhe(u.supervisor, tarefaId);
      expect(tarefa.status).toBe('IMPEDIDA');
      expect(tarefa.eventos.at(-1)?.motivo).toBe('Produto não encontrado no depósito');
    });

    it('só o gestor reabre uma tarefa impedida, e ela volta para a fila sem responsável', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      await agir(u.operadorA, tarefaId, 'ACEITAR');
      await agir(u.operadorA, tarefaId, 'IMPEDIR', 'Sem acesso ao depósito');

      expect(await agir(u.operadorA, tarefaId, 'REABRIR')).toMatchObject({
        status: 'REJEITADO',
        motivo: 'Somente o gestor pode fazer isso',
      });
      expect(await agir(u.supervisor, tarefaId, 'REABRIR')).toMatchObject({ status: 'APLICADO' });
      expect(await detalhe(u.supervisor, tarefaId)).toMatchObject({
        status: 'GERADA',
        responsavelId: null,
      });
    });

    it('tarefa de outra loja responde como inexistente', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      expect(
        await agir(u.operadorOutraLoja, tarefaId, 'ACEITAR', undefined, lojas.l02),
      ).toMatchObject({ status: 'REJEITADO', motivo: 'Tarefa não encontrada nesta loja' });
    });

    it('o histórico é imutável: o banco recusa alterar um evento', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      const [primeiro] = (await detalhe(u.operadorA, tarefaId)).eventos;
      await expect(
        prisma.tarefaEvento.update({ where: { id: primeiro!.id }, data: { motivo: 'adulterado' } }),
      ).rejects.toThrow();
    });
  });

  describe('fila do gestor', () => {
    it('lista as abertas; operador não acessa a fila', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      const { body } = await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .set('Authorization', `Bearer ${u.supervisor.token}`)
        .expect(200);
      expect(body.some((t: { id: string }) => t.id === tarefaId)).toBe(true);
      expect(
        body.every((t: { status: string }) =>
          ['GERADA', 'ACEITA', 'EM_EXECUCAO'].includes(t.status),
        ),
      ).toBe(true);

      await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .set('Authorization', `Bearer ${u.operadorA.token}`)
        .expect(403);
    });

    it('atrasadas: prazo vencido e ainda aberta', async () => {
      const { body: atrasada } = await request(servidor())
        .post(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .set('Authorization', `Bearer ${u.supervisor.token}`)
        .send({
          tipo: 'MANUAL',
          titulo: `Atrasada ${sufixo}`,
          prazo: new Date(Date.now() - 60_000).toISOString(),
        })
        .expect(201);

      const { body } = await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/tarefas`)
        .query({ atrasadas: 'true' })
        .set('Authorization', `Bearer ${u.supervisor.token}`)
        .expect(200);
      expect(body.map((t: { id: string }) => t.id)).toContain(atrasada.id);

      const { body: resumo } = await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/tarefas/resumo`)
        .set('Authorization', `Bearer ${u.supervisor.token}`)
        .expect(200);
      expect(resumo.atrasadas).toBeGreaterThanOrEqual(1);
    });

    it('redistribui para alguém da loja; recusa alguém de outra loja; devolve para a fila', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      await agir(u.operadorA, tarefaId, 'ACEITAR');
      const atribuir = (responsavelId: string | null) =>
        request(servidor())
          .post(`/api/v1/lojas/${lojas.l01}/tarefas/${tarefaId}/atribuir`)
          .set('Authorization', `Bearer ${u.supervisor.token}`)
          .send({ responsavelId });

      const { body } = await atribuir(u.operadorB.id).expect(201);
      expect(body).toMatchObject({
        responsavelId: u.operadorB.id,
        responsavelNome: `Operador B ${sufixo}`,
      });

      await atribuir(u.operadorOutraLoja.id).expect(400);

      const { body: devolvida } = await atribuir(null).expect(201);
      expect(devolvida).toMatchObject({ responsavelId: null, status: 'GERADA' });
    });
  });

  describe('pull', () => {
    it('as tarefas da loja chegam ao aparelho, e a mudança de status chega no pull seguinte', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      await new Promise((resolve) => setTimeout(resolve, 2_200)); // horizonte do pull

      let cursor: string | undefined;
      let resposta: PullResponse;
      const ids: string[] = [];
      do {
        const { body } = await request(servidor())
          .get(`/api/v1/lojas/${lojas.l01}/sincronizacao/alteracoes`)
          .query({ limite: 1000, ...(cursor && { cursor }) })
          .set('Authorization', `Bearer ${u.operadorB.token}`)
          .expect(200);
        resposta = body as PullResponse;
        ids.push(...resposta.alteracoes.tarefas.map((t) => t.id));
        cursor = resposta.cursor;
      } while (resposta.temMais);
      expect(ids).toContain(tarefaId);

      // O colega aceita; o pull do operadorB (com o cursor) traz a mudança
      await agir(u.operadorA, tarefaId, 'ACEITAR');
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      const { body } = await request(servidor())
        .get(`/api/v1/lojas/${lojas.l01}/sincronizacao/alteracoes`)
        .query({ cursor })
        .set('Authorization', `Bearer ${u.operadorB.token}`)
        .expect(200);
      expect((body as PullResponse).alteracoes.tarefas).toEqual([
        expect.objectContaining({
          id: tarefaId,
          status: 'ACEITA',
          responsavelNome: `Operador A ${sufixo}`,
        }),
      ]);
    });

    it('tarefas de outra loja não chegam', async () => {
      const { tarefaId } = await criarPeloAparelho(u.operadorA);
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      const { body } = await request(servidor())
        .get(`/api/v1/lojas/${lojas.l02}/sincronizacao/alteracoes`)
        .query({ limite: 1000 })
        .set('Authorization', `Bearer ${u.operadorOutraLoja.token}`)
        .expect(200);
      expect((body as PullResponse).alteracoes.tarefas.map((t) => t.id)).not.toContain(tarefaId);
    });
  });
});
