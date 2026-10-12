import { Injectable, Logger } from '@nestjs/common';
import {
  dadosEventoPorTipo,
  type EnviarEventosRequest,
  type EnviarEventosResponse,
  type EventoEnvelope,
  type ResultadoEnvioEvento,
  type TipoEvento,
} from '@meu-estoque/shared';
import type { z } from 'zod';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

/** Quem enviou e de qual loja: o que todo aplicador de evento precisa saber. */
export interface ContextoEvento {
  lojaId: string;
  usuario: UsuarioAutenticado;
  ocorridoEm: Date;
}

/**
 * Lançado por um aplicador quando o evento viola uma regra de negócio
 * (ex.: aceitar uma tarefa já concluída). O evento é REJEITADO e não volta mais.
 */
export class EventoRejeitado extends Error {}

type DadosDo<T extends TipoEvento> = z.output<(typeof dadosEventoPorTipo)[T]>;
type Aplicador<T extends TipoEvento> = (
  tx: Prisma.TransactionClient,
  contexto: ContextoEvento,
  dados: DadosDo<T>,
) => Promise<void>;

/**
 * O que cada tipo de evento faz no banco. As próximas etapas acrescentam aqui
 * (aceitar tarefa, cadastrar lote, registrar quebra...).
 * O TypeScript obriga a ter um aplicador para CADA tipo declarado no shared.
 */
const aplicadores: { [T in TipoEvento]: Aplicador<T> } = {
  // Não altera nada: só prova que o evento atravessou a fila e foi registrado
  DIAGNOSTICO: async () => {},
};

function ehTipoConhecido(tipo: string): tipo is TipoEvento {
  return Object.hasOwn(dadosEventoPorTipo, tipo);
}

/** Erro do Prisma para "chave única já existe" (aqui: o mesmo evento chegando em paralelo). */
function ehChaveDuplicada(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/**
 * Recebe os eventos da outbox dos aparelhos ("inbox pattern").
 *
 * Cada evento é processado numa transação própria que faz DUAS coisas juntas:
 * registra o id em eventos_recebidos e aplica o efeito. Ou acontecem as duas, ou nenhuma.
 * Como o id é a chave primária, o mesmo evento nunca é aplicado duas vezes,
 * por mais que o aparelho o reenvie (efeito "exatamente uma vez").
 */
@Injectable()
export class EventosService {
  private readonly logger = new Logger(EventosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async receber(
    lojaId: string,
    usuario: UsuarioAutenticado,
    { eventos }: EnviarEventosRequest,
  ): Promise<EnviarEventosResponse> {
    const resultados: ResultadoEnvioEvento[] = [];
    // Em ordem, um por vez: a ordem da fila do aparelho importa
    // (ex.: "aceitar" uma tarefa precisa ser aplicado antes de "concluir")
    for (const evento of eventos) {
      resultados.push(await this.processar(lojaId, usuario, evento));
    }
    return { resultados };
  }

  private async processar(
    lojaId: string,
    usuario: UsuarioAutenticado,
    evento: EventoEnvelope,
  ): Promise<ResultadoEnvioEvento> {
    // 1. Já recebido antes? (reenvio da outbox depois de uma falha de rede)
    const anterior = await this.prisma.eventoRecebido.findUnique({
      where: { id: evento.id },
      select: { usuarioId: true, resultado: true, motivo: true },
    });
    if (anterior) {
      // O mesmo UUID vindo de OUTRO usuário não é reenvio: não revelamos nada sobre o evento original
      if (anterior.usuarioId !== usuario.id) {
        return {
          id: evento.id,
          status: 'REJEITADO',
          motivo: 'Identificador de evento já utilizado',
        };
      }
      return anterior.resultado === 'REJEITADO'
        ? { id: evento.id, status: 'REJEITADO', motivo: anterior.motivo ?? undefined }
        : { id: evento.id, status: 'DUPLICADO' };
    }

    // 2. Tipo conhecido e dados no formato certo?
    if (!ehTipoConhecido(evento.tipo)) {
      return this.rejeitar(lojaId, usuario, evento, `Tipo de evento desconhecido: ${evento.tipo}`);
    }
    const validacao = dadosEventoPorTipo[evento.tipo].safeParse(evento.dados);
    if (!validacao.success) {
      const motivo = validacao.error.issues
        .map((problema) => `${problema.path.join('.') || 'dados'}: ${problema.message}`)
        .join('; ');
      return this.rejeitar(lojaId, usuario, evento, `Dados inválidos (${motivo})`);
    }

    // 3. Registra e aplica na MESMA transação
    const contexto: ContextoEvento = { lojaId, usuario, ocorridoEm: new Date(evento.ocorridoEm) };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventoRecebido.create({
          data: this.registro(lojaId, usuario, evento, 'APLICADO', null),
        });
        const aplicar = aplicadores[evento.tipo as TipoEvento] as Aplicador<TipoEvento>;
        await aplicar(tx, contexto, validacao.data);
      });
      return { id: evento.id, status: 'APLICADO' };
    } catch (erro) {
      // Duas cópias do mesmo evento chegaram ao mesmo tempo: a outra já gravou
      if (ehChaveDuplicada(erro)) return { id: evento.id, status: 'DUPLICADO' };
      if (erro instanceof EventoRejeitado) {
        return this.rejeitar(lojaId, usuario, evento, erro.message);
      }
      // Erro inesperado (banco fora, bug): sobe como 500 e o aparelho tenta de novo mais tarde.
      // Os eventos anteriores deste lote já foram gravados e voltarão como DUPLICADO.
      throw erro;
    }
  }

  /** Grava o evento como REJEITADO (auditoria) e avisa o aparelho para não reenviar. */
  private async rejeitar(
    lojaId: string,
    usuario: UsuarioAutenticado,
    evento: EventoEnvelope,
    motivo: string,
  ): Promise<ResultadoEnvioEvento> {
    this.logger.warn(`Evento ${evento.id} (${evento.tipo}) rejeitado: ${motivo}`);
    try {
      await this.prisma.eventoRecebido.create({
        data: this.registro(lojaId, usuario, evento, 'REJEITADO', motivo),
      });
    } catch (erro) {
      if (!ehChaveDuplicada(erro)) throw erro;
    }
    return { id: evento.id, status: 'REJEITADO', motivo };
  }

  private registro(
    lojaId: string,
    usuario: UsuarioAutenticado,
    evento: EventoEnvelope,
    resultado: 'APLICADO' | 'REJEITADO',
    motivo: string | null,
  ): Prisma.EventoRecebidoUncheckedCreateInput {
    return {
      id: evento.id,
      tipo: evento.tipo,
      lojaId,
      usuarioId: usuario.id,
      ocorridoEm: new Date(evento.ocorridoEm),
      resultado,
      motivo,
      dados:
        evento.dados === undefined || evento.dados === null
          ? Prisma.DbNull
          : (evento.dados as Prisma.InputJsonValue),
    };
  }
}
