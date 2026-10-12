import { z } from 'zod';
import { dadosAcaoTarefaSchema, dadosCriarTarefaSchema, tarefaResumoSchema } from './tarefas.js';

// ─── Tipos básicos ────────────────────────────────────────────────────────────

/** Dinheiro e quantidades viajam como TEXTO ("28.79"): nunca passam por float. */
export const decimalTextoSchema = z.string().regex(/^-?\d+(\.\d+)?$/, 'Número decimal inválido');

/** Unidade de venda: peças (UN) ou peso (KG). Mesmos valores do enum UnidadeMedida do Prisma. */
export const unidadeMedidaSchema = z.enum(['UN', 'KG']);
export type UnidadeMedida = z.infer<typeof unidadeMedidaSchema>;

// ─── Pull: servidor → aparelho ────────────────────────────────────────────────
// Cada registro vem com "excluido": o aparelho apaga a linha local em vez de gravá-la.
// É por isso que o servidor usa exclusão lógica (excluidoEm) em vez de DELETE:
// uma linha apagada de verdade não teria como "avisar" os aparelhos.

export const categoriaSyncSchema = z.object({
  id: z.uuid(),
  codigoErp: z.string(),
  nome: z.string(),
  paiId: z.uuid().nullable(),
  excluido: z.boolean(),
});

export const produtoSyncSchema = z.object({
  id: z.uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  categoriaId: z.uuid(),
  unidade: unidadeMedidaSchema,
  controlaLote: z.boolean(),
  excluido: z.boolean(),
});

export const eanSyncSchema = z.object({
  id: z.uuid(),
  codigo: z.string(),
  produtoId: z.uuid(),
  quantidadeEmbalagem: z.number().int().positive(),
  excluido: z.boolean(),
});

/** Preço, saldo e endereço do produto NA LOJA da sincronização. */
export const produtoLojaSyncSchema = z.object({
  produtoId: z.uuid(),
  preco: decimalTextoSchema,
  saldo: decimalTextoSchema,
  endereco: z.string().nullable(),
  excluido: z.boolean(),
});

export const loteSyncSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid(),
  codigo: z.string(),
  /** Só a data ("2026-11-30"): validade não tem hora nem fuso */
  validade: z.iso.date(),
  quantidadeEstimada: decimalTextoSchema,
  excluido: z.boolean(),
});

export type CategoriaSync = z.infer<typeof categoriaSyncSchema>;
export type ProdutoSync = z.infer<typeof produtoSyncSchema>;
export type EanSync = z.infer<typeof eanSyncSchema>;
export type ProdutoLojaSync = z.infer<typeof produtoLojaSyncSchema>;
export type LoteSync = z.infer<typeof loteSyncSchema>;

export const alteracoesSchema = z.object({
  categorias: z.array(categoriaSyncSchema),
  produtos: z.array(produtoSyncSchema),
  eans: z.array(eanSyncSchema),
  produtosLoja: z.array(produtoLojaSyncSchema),
  lotes: z.array(loteSyncSchema),
  /**
   * Tarefas da loja: as abertas e as encerradas nos últimos dias (para o histórico recente).
   * Tarefa não é apagada: encerrada, ela chega com o status final e o app decide se mantém.
   */
  tarefas: z.array(tarefaResumoSchema),
});
export type Alteracoes = z.infer<typeof alteracoesSchema>;

export const LIMITE_PADRAO_PULL = 500;
export const LIMITE_MAXIMO_PULL = 1000;

/** Parâmetros do pull (vêm na query string, por isso o coerce de texto para número). */
export const pullQuerySchema = z.object({
  /** Cursor opaco devolvido pelo pull anterior. Ausente = carga inicial completa. */
  cursor: z.string().max(4000).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_PULL).default(LIMITE_PADRAO_PULL),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

export const pullResponseSchema = z.object({
  alteracoes: alteracoesSchema,
  /** Guarde e envie no próximo pull. O aparelho não precisa (nem deve) entender o conteúdo. */
  cursor: z.string(),
  /** true = ainda há alterações: peça a próxima página já */
  temMais: z.boolean(),
  /** Horário do servidor, útil para mostrar "sincronizado às 10:42" */
  servidorEm: z.iso.datetime(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

// ─── Push: aparelho → servidor (fila outbox) ──────────────────────────────────

/**
 * Tipos de evento aceitos e o formato dos dados de cada um.
 * Cada etapa nova acrescenta tipos aqui (Etapa 9: LOTE_CADASTRADO, QUEBRA_REGISTRADA...).
 * DIAGNOSTICO não muda nada no servidor: serve para testar a fila de ponta a ponta.
 */
export const dadosEventoPorTipo = {
  DIAGNOSTICO: z.object({ mensagem: z.string().trim().min(1).max(200) }),
  /** Aceitar, iniciar, concluir, devolver, impedir, cancelar ou reabrir uma tarefa */
  TAREFA_ACAO: dadosAcaoTarefaSchema,
  /** Tarefa criada no aparelho (ex.: o operador bipou um produto no corredor) */
  TAREFA_CRIADA: dadosCriarTarefaSchema,
} as const;

export type TipoEvento = keyof typeof dadosEventoPorTipo;
export const tiposEvento = Object.keys(dadosEventoPorTipo) as [TipoEvento, ...TipoEvento[]];

/**
 * "Envelope" do evento. Os dados são validados DEPOIS, um evento por vez, conforme o tipo:
 * assim um evento defeituoso é rejeitado sozinho e não trava os outros da fila.
 */
export const eventoEnvelopeSchema = z.object({
  /** UUID gerado no aparelho: a chave de idempotência */
  id: z.uuid(),
  tipo: z.string().min(1).max(50),
  /** Horário do aparelho quando o fato aconteceu */
  ocorridoEm: z.iso.datetime({ offset: true }),
  dados: z.unknown(),
});
export type EventoEnvelope = z.infer<typeof eventoEnvelopeSchema>;

export const MAXIMO_EVENTOS_POR_ENVIO = 100;

export const enviarEventosRequestSchema = z.object({
  eventos: z.array(eventoEnvelopeSchema).min(1).max(MAXIMO_EVENTOS_POR_ENVIO),
});
export type EnviarEventosRequest = z.infer<typeof enviarEventosRequestSchema>;

/**
 * APLICADO: gravado agora. DUPLICADO: já tinha chegado antes (reenvio), nada a fazer.
 * REJEITADO: inválido; o aparelho NÃO deve reenviar (iria falhar sempre).
 */
export const statusEventoSchema = z.enum(['APLICADO', 'DUPLICADO', 'REJEITADO']);
export type StatusEvento = z.infer<typeof statusEventoSchema>;

export const resultadoEnvioEventoSchema = z.object({
  id: z.uuid(),
  status: statusEventoSchema,
  motivo: z.string().optional(),
  /**
   * Eventos de tarefa: como a tarefa ficou no servidor DEPOIS deste evento (aplicado ou
   * recusado). O aparelho grava na hora e não precisa esperar o próximo pull para mostrar
   * o estado certo (o pull só enxerga mudanças com mais de 2 segundos, ver "horizonte").
   */
  tarefa: tarefaResumoSchema.optional(),
});
export type ResultadoEnvioEvento = z.infer<typeof resultadoEnvioEventoSchema>;

export const enviarEventosResponseSchema = z.object({
  resultados: z.array(resultadoEnvioEventoSchema),
});
export type EnviarEventosResponse = z.infer<typeof enviarEventosResponseSchema>;
