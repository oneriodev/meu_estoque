import {
  dadosAcaoTarefaSchema,
  dadosCriarTarefaSchema,
  type AcaoTarefa,
  type DadosCriarTarefa,
} from '@meu-estoque/shared';
import * as Crypto from 'expo-crypto';
import { descartarRejeitado } from '@/db/repositorios/outboxRepositorio';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';

/**
 * Ações sobre tarefas. Nenhuma fala com a API diretamente: tudo vira EVENTO na outbox
 * (funciona offline) e a sincronização envia quando houver internet.
 * Os dados são validados ANTES de entrar na fila com o mesmo schema que a API usa:
 * um evento inválido nunca chega a ser enfileirado.
 */
export function agirNaTarefa(tarefaId: string, acao: AcaoTarefa, motivo?: string): void {
  const dados = dadosAcaoTarefaSchema.parse({ tarefaId, acao, ...(motivo && { motivo }) });
  useSincronizacaoStore.getState().registrarEvento('TAREFA_ACAO', dados);
}

/** Cria a tarefa no aparelho (o id nasce aqui) e devolve o id para abrir a tela dela. */
export function criarTarefa(dados: Omit<DadosCriarTarefa, 'tarefaId'>): string {
  const tarefaId = Crypto.randomUUID();
  const validado = dadosCriarTarefaSchema.parse({ ...dados, tarefaId });
  useSincronizacaoStore.getState().registrarEvento('TAREFA_CRIADA', validado);
  return tarefaId;
}

/** O operador leu o aviso de recusa: some da tela. */
export function descartarRecusa(eventoId: string): void {
  descartarRejeitado(eventoId);
  useSincronizacaoStore.getState().atualizarContagens();
}
