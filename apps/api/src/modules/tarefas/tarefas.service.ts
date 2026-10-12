import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REGRAS_ACOES,
  STATUS_ABERTOS,
  ehGestor,
  validarAcao,
  type AtribuirTarefaRequest,
  type CriarTarefaRequest,
  type DadosAcaoTarefa,
  type DadosCriarTarefa,
  type FilaTarefasQuery,
  type ResumoFila,
  type TarefaDetalhe,
  type TarefaResumo,
} from '@meu-estoque/shared';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { EventoRejeitado, type ContextoEvento } from '../sincronizacao/evento.js';

/** Tipos que o OPERADOR pode abrir no corredor. Contagem (inventário) é decisão do gestor. */
const TIPOS_CRIADOS_POR_OPERADOR = [
  'MANUAL',
  'REPOSICAO',
  'RUPTURA',
  'VALIDADE',
  'AUDITORIA_PRECO',
];

/** O que buscar de uma tarefa para montar o resumo (inclui o NOME de quem assumiu). */
export const selecaoResumo = {
  id: true,
  tipo: true,
  status: true,
  origem: true,
  prioridade: true,
  titulo: true,
  descricao: true,
  produtoId: true,
  loteId: true,
  responsavelId: true,
  responsavel: { select: { nome: true } },
  prazo: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.TarefaSelect;

type TarefaSelecionada = Prisma.TarefaGetPayload<{ select: typeof selecaoResumo }>;

/** Converte a linha do banco no formato da API (datas em ISO, nome do responsável). */
export function paraResumo(tarefa: TarefaSelecionada): TarefaResumo {
  const { responsavel, ...resto } = tarefa;
  return {
    ...resto,
    responsavelNome: responsavel?.nome ?? null,
    prazo: tarefa.prazo?.toISOString() ?? null,
    criadoEm: tarefa.criadoEm.toISOString(),
    atualizadoEm: tarefa.atualizadoEm.toISOString(),
  };
}

/**
 * Regras do motor de tarefas. Toda mudança de status passa por aqui e deixa
 * um registro IMUTÁVEL em tarefa_eventos (quem, o quê, quando e por quê).
 */
@Injectable()
export class TarefasService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Pela fila outbox (ações feitas no aparelho, possivelmente offline) ──────

  /**
   * Aplica uma ação (aceitar, iniciar, concluir...). Roda DENTRO da transação do evento:
   * se algo for recusado, nada é gravado e o evento volta como REJEITADO com a mensagem.
   *
   * Conflitos offline: dois operadores aceitam a mesma tarefa sem internet.
   * Quem chegar primeiro ao servidor fica com ela; o segundo recebe a recusa
   * "já foi assumida por Fulano". O servidor é a autoridade.
   */
  async aplicarAcao(
    tx: Prisma.TransactionClient,
    contexto: ContextoEvento,
    { tarefaId, acao, motivo }: DadosAcaoTarefa,
  ): Promise<void> {
    const tarefa = await tx.tarefa.findFirst({
      where: { id: tarefaId, lojaId: contexto.lojaId },
      select: { status: true, responsavelId: true, responsavel: { select: { nome: true } } },
    });
    // Tarefa de outra loja responde igual a inexistente: não revela que ela existe
    if (!tarefa) throw new EventoRejeitado('Tarefa não encontrada nesta loja');

    const recusa = validarAcao(tarefa, contexto.usuario, acao, motivo);
    if (recusa) {
      const quem = tarefa.responsavel?.nome;
      throw new EventoRejeitado(
        recusa.includes('outra pessoa') && quem ? `${recusa} (${quem})` : recusa,
      );
    }

    const regra = REGRAS_ACOES[acao];
    const responsavelId =
      acao === 'ACEITAR' || acao === 'INICIAR'
        ? (tarefa.responsavelId ?? contexto.usuario.id) // assumir
        : acao === 'DEVOLVER' || acao === 'REABRIR'
          ? null // volta para a fila
          : tarefa.responsavelId;

    // "Controle otimista de concorrência": só atualiza se o status ainda for o que lemos.
    // Se outra ação mudou a tarefa entre a leitura e a gravação, count = 0.
    const { count } = await tx.tarefa.updateMany({
      where: { id: tarefaId, status: tarefa.status },
      data: { status: regra.para, responsavelId },
    });
    if (count === 0) {
      throw new EventoRejeitado(
        'A tarefa mudou enquanto a ação era enviada. Atualize e tente de novo.',
      );
    }

    await tx.tarefaEvento.create({
      data: {
        id: contexto.eventoId, // o mesmo UUID do evento: idempotência também no histórico
        tarefaId,
        statusAnterior: tarefa.status,
        statusNovo: regra.para,
        usuarioId: contexto.usuario.id,
        motivo: motivo ?? null,
        ocorridoEm: contexto.ocorridoEm,
      },
    });
  }

  /** Tarefa criada no aparelho: o id veio de lá, então ela já existia offline. */
  async criarPorEvento(
    tx: Prisma.TransactionClient,
    contexto: ContextoEvento,
    dados: DadosCriarTarefa,
  ): Promise<void> {
    if (!ehGestor(contexto.usuario.papel) && !TIPOS_CRIADOS_POR_OPERADOR.includes(dados.tipo)) {
      throw new EventoRejeitado('Somente o gestor pode abrir este tipo de tarefa');
    }
    if (await tx.tarefa.findUnique({ where: { id: dados.tarefaId }, select: { id: true } })) {
      throw new EventoRejeitado('Já existe uma tarefa com este identificador');
    }
    await this.validarProduto(tx, dados.produtoId, (mensagem) => new EventoRejeitado(mensagem));

    await this.gravarNova(tx, {
      id: dados.tarefaId,
      eventoId: contexto.eventoId,
      lojaId: contexto.lojaId,
      criadoPorId: contexto.usuario.id,
      ocorridoEm: contexto.ocorridoEm,
      dados,
    });
  }

  // ─── Pela API (gestor online: painel web ou app) ─────────────────────────────

  async criarPeloGestor(
    lojaId: string,
    gestor: UsuarioAutenticado,
    corpo: CriarTarefaRequest,
  ): Promise<TarefaResumo> {
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.validarProduto(
        tx,
        corpo.produtoId,
        (mensagem) => new BadRequestException(mensagem),
      );
      if (corpo.responsavelId) await this.validarMembroDaLoja(tx, lojaId, corpo.responsavelId);
      await this.gravarNova(tx, {
        id,
        eventoId: randomUUID(),
        lojaId,
        criadoPorId: gestor.id,
        ocorridoEm: new Date(),
        dados: corpo,
        responsavelId: corpo.responsavelId ?? null,
        prazo: corpo.prazo ? new Date(corpo.prazo) : null,
      });
    });
    return this.buscarResumo(lojaId, id);
  }

  /** Redistribuição: o gestor passa a tarefa para outra pessoa (ou devolve para a fila). */
  async atribuir(
    lojaId: string,
    gestor: UsuarioAutenticado,
    tarefaId: string,
    { responsavelId }: AtribuirTarefaRequest,
  ): Promise<TarefaResumo> {
    await this.prisma.$transaction(async (tx) => {
      const tarefa = await tx.tarefa.findFirst({
        where: { id: tarefaId, lojaId },
        select: { status: true },
      });
      if (!tarefa) throw new NotFoundException('Tarefa não encontrada');
      if (!STATUS_ABERTOS.includes(tarefa.status)) {
        throw new ConflictException('Só é possível redistribuir tarefas abertas');
      }
      if (responsavelId) await this.validarMembroDaLoja(tx, lojaId, responsavelId);

      // Devolvida à fila sem responsável, a tarefa volta a ser "pendente"
      const status = responsavelId === null ? 'GERADA' : tarefa.status;
      await tx.tarefa.update({ where: { id: tarefaId }, data: { responsavelId, status } });
      await tx.tarefaEvento.create({
        data: {
          id: randomUUID(),
          tarefaId,
          statusAnterior: tarefa.status,
          statusNovo: status,
          usuarioId: gestor.id,
          motivo: responsavelId ? 'Redistribuída pelo gestor' : 'Devolvida para a fila pelo gestor',
          ocorridoEm: new Date(),
          dados: { acao: 'ATRIBUIR', responsavelId },
        },
      });
    });
    return this.buscarResumo(lojaId, tarefaId);
  }

  /** Fila da loja para o gestor: por padrão, só as abertas, das mais urgentes para as menos. */
  async listarFila(lojaId: string, filtros: FilaTarefasQuery): Promise<TarefaResumo[]> {
    const tarefas = await this.prisma.tarefa.findMany({
      where: {
        lojaId,
        status: filtros.status ?? { in: [...STATUS_ABERTOS] },
        ...(filtros.tipo && { tipo: filtros.tipo }),
        ...(filtros.responsavelId && { responsavelId: filtros.responsavelId }),
        ...(filtros.atrasadas && {
          prazo: { lt: new Date() },
          status: { in: [...STATUS_ABERTOS] },
        }),
      },
      select: selecaoResumo,
      orderBy: [
        { prioridade: 'desc' },
        { prazo: { sort: 'asc', nulls: 'last' } },
        { criadoEm: 'asc' },
      ],
      take: 200,
    });
    return tarefas.map(paraResumo);
  }

  /** Os números do topo da fila do gestor. */
  async resumoFila(lojaId: string): Promise<ResumoFila> {
    const agora = new Date();
    const [porStatus, atrasadas, concluidas24h] = await Promise.all([
      this.prisma.tarefa.groupBy({
        by: ['status'],
        where: { lojaId, status: { in: ['GERADA', 'ACEITA', 'EM_EXECUCAO', 'IMPEDIDA'] } },
        _count: { _all: true },
      }),
      this.prisma.tarefa.count({
        where: { lojaId, status: { in: [...STATUS_ABERTOS] }, prazo: { lt: agora } },
      }),
      this.prisma.tarefa.count({
        where: {
          lojaId,
          status: 'CONCLUIDA',
          atualizadoEm: { gte: new Date(agora.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    const total = (status: string) =>
      porStatus.find((linha) => linha.status === status)?._count._all ?? 0;
    return {
      pendentes: total('GERADA'),
      aceitas: total('ACEITA'),
      emExecucao: total('EM_EXECUCAO'),
      impedidas: total('IMPEDIDA'),
      atrasadas,
      concluidas24h,
    };
  }

  /** Detalhe com o histórico completo (auditoria: quem fez o quê, quando e por quê). */
  async detalhar(lojaId: string, tarefaId: string): Promise<TarefaDetalhe> {
    const tarefa = await this.prisma.tarefa.findFirst({
      where: { id: tarefaId, lojaId },
      select: {
        ...selecaoResumo,
        eventos: {
          orderBy: [{ ocorridoEm: 'asc' }, { recebidoEm: 'asc' }],
          select: {
            id: true,
            statusAnterior: true,
            statusNovo: true,
            motivo: true,
            ocorridoEm: true,
            recebidoEm: true,
            usuario: { select: { nome: true } },
          },
        },
      },
    });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada');
    const { eventos, ...resumo } = tarefa;
    return {
      ...paraResumo(resumo),
      eventos: eventos.map(({ usuario, ...evento }) => ({
        ...evento,
        usuarioNome: usuario?.nome ?? null,
        ocorridoEm: evento.ocorridoEm.toISOString(),
        recebidoEm: evento.recebidoEm.toISOString(),
      })),
    };
  }

  // ─── Apoio ───────────────────────────────────────────────────────────────────

  private async buscarResumo(lojaId: string, tarefaId: string): Promise<TarefaResumo> {
    const tarefa = await this.prisma.tarefa.findFirstOrThrow({
      where: { id: tarefaId, lojaId },
      select: selecaoResumo,
    });
    return paraResumo(tarefa);
  }

  private async gravarNova(
    tx: Prisma.TransactionClient,
    nova: {
      id: string;
      eventoId: string;
      lojaId: string;
      criadoPorId: string;
      ocorridoEm: Date;
      dados: Omit<DadosCriarTarefa, 'tarefaId'>;
      responsavelId?: string | null;
      prazo?: Date | null;
    },
  ): Promise<void> {
    await tx.tarefa.create({
      data: {
        id: nova.id,
        lojaId: nova.lojaId,
        tipo: nova.dados.tipo,
        status: 'GERADA',
        origem: 'MANUAL',
        prioridade: nova.dados.prioridade,
        titulo: nova.dados.titulo,
        descricao: nova.dados.descricao ?? null,
        produtoId: nova.dados.produtoId ?? null,
        responsavelId: nova.responsavelId ?? null,
        criadoPorId: nova.criadoPorId,
        prazo: nova.prazo ?? null,
      },
    });
    // O nascimento da tarefa também entra no histórico
    await tx.tarefaEvento.create({
      data: {
        id: nova.eventoId,
        tarefaId: nova.id,
        statusAnterior: null,
        statusNovo: 'GERADA',
        usuarioId: nova.criadoPorId,
        motivo: null,
        ocorridoEm: nova.ocorridoEm,
      },
    });
  }

  private async validarProduto(
    tx: Prisma.TransactionClient,
    produtoId: string | undefined,
    erro: (mensagem: string) => Error,
  ): Promise<void> {
    if (!produtoId) return;
    const produto = await tx.produto.findFirst({
      where: { id: produtoId, excluidoEm: null },
      select: { id: true },
    });
    if (!produto) throw erro('Produto não encontrado');
  }

  /** O responsável precisa ser da loja (ou administrador, que acessa todas). */
  private async validarMembroDaLoja(
    tx: Prisma.TransactionClient,
    lojaId: string,
    usuarioId: string,
  ): Promise<void> {
    const usuario = await tx.usuario.findFirst({
      where: {
        id: usuarioId,
        ativo: true,
        OR: [{ papel: 'ADMINISTRADOR' }, { lojas: { some: { lojaId } } }],
      },
      select: { id: true },
    });
    if (!usuario) throw new BadRequestException('O responsável não pertence a esta loja');
  }
}
