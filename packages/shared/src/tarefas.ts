import { z } from 'zod';
import { papelUsuarioSchema, statusTarefaSchema, tipoTarefaSchema } from './enums.js';

// Apelidos locais (não exportados: o enums.ts já exporta StatusTarefa e TipoTarefa)
type Status = z.infer<typeof statusTarefaSchema>;
type Papel = z.infer<typeof papelUsuarioSchema>;

// ─── Máquina de estados do ciclo da tarefa ────────────────────────────────────
//
//            ACEITAR            INICIAR             CONCLUIR
//   GERADA ──────────► ACEITA ──────────► EM_EXECUCAO ──────────► CONCLUIDA
//     ▲  └──────── INICIAR (direto) ────────────┘ │
//     │                │                           │
//     │ DEVOLVER ◄─────┘          IMPEDIR (motivo) ▼
//     │                                         IMPEDIDA
//     │ REABRIR (só gestor) ◄── IMPEDIDA / CANCELADA
//     └ CANCELAR (motivo) a partir de GERADA, ACEITA ou EM_EXECUCAO ──► CANCELADA
//
// OBSOLETA não é uma ação de pessoa: o motor de análise marca quando a tarefa perde o sentido
// (ex.: o produto foi reposto por outro caminho). Por isso não aparece aqui.

export const acaoTarefaSchema = z.enum([
  'ACEITAR',
  'INICIAR',
  'CONCLUIR',
  'DEVOLVER',
  'IMPEDIR',
  'CANCELAR',
  'REABRIR',
]);
export type AcaoTarefa = z.infer<typeof acaoTarefaSchema>;

interface RegraAcao {
  /** De quais status a ação pode partir */
  de: readonly Status[];
  /** Para qual status vai */
  para: Status;
  /** Precisa explicar o porquê (vai para o histórico e para o gestor) */
  exigeMotivo: boolean;
  /** Só Supervisor e Administrador */
  somenteGestor: boolean;
}

/**
 * A tabela de transições é a ÚNICA fonte da verdade do ciclo de vida.
 * O app usa para decidir quais botões mostrar; a API usa para recusar o que não pode.
 * Mudou uma regra? Muda aqui, e as duas pontas mudam juntas.
 */
export const REGRAS_ACOES: Record<AcaoTarefa, RegraAcao> = {
  ACEITAR: { de: ['GERADA'], para: 'ACEITA', exigeMotivo: false, somenteGestor: false },
  INICIAR: {
    de: ['GERADA', 'ACEITA'],
    para: 'EM_EXECUCAO',
    exigeMotivo: false,
    somenteGestor: false,
  },
  CONCLUIR: { de: ['EM_EXECUCAO'], para: 'CONCLUIDA', exigeMotivo: false, somenteGestor: false },
  DEVOLVER: { de: ['ACEITA'], para: 'GERADA', exigeMotivo: false, somenteGestor: false },
  IMPEDIR: {
    de: ['ACEITA', 'EM_EXECUCAO'],
    para: 'IMPEDIDA',
    exigeMotivo: true,
    somenteGestor: false,
  },
  CANCELAR: {
    de: ['GERADA', 'ACEITA', 'EM_EXECUCAO'],
    para: 'CANCELADA',
    exigeMotivo: true,
    somenteGestor: false,
  },
  REABRIR: {
    de: ['IMPEDIDA', 'CANCELADA'],
    para: 'GERADA',
    exigeMotivo: false,
    somenteGestor: true,
  },
};

/** Status em que a tarefa ainda está "na fila" (falta fazer). */
export const STATUS_ABERTOS: readonly Status[] = ['GERADA', 'ACEITA', 'EM_EXECUCAO'];

export function ehGestor(papel: Papel): boolean {
  return papel === 'SUPERVISOR' || papel === 'ADMINISTRADOR';
}

/** Ações que a pessoa pode fazer na tarefa agora (o app desenha só estes botões). */
export function acoesPermitidas(
  tarefa: { status: Status; responsavelId: string | null },
  usuario: { id: string; papel: Papel },
): AcaoTarefa[] {
  return acaoTarefaSchema.options.filter(
    (acao) => validarAcao(tarefa, usuario, acao, 'motivo não avaliado aqui') === null,
  );
}

/**
 * Confere se a ação é permitida. Devolve null se pode, ou o motivo da recusa (para o usuário).
 * Regras além da tabela de transições:
 * - tarefa assumida por alguém só pode ser tocada por essa pessoa ou por um gestor;
 * - CANCELAR por operador só vale para tarefa que ele mesmo assumiu (ou ainda sem responsável).
 */
export function validarAcao(
  tarefa: { status: Status; responsavelId: string | null },
  usuario: { id: string; papel: Papel },
  acao: AcaoTarefa,
  motivo?: string | null,
): string | null {
  const regra = REGRAS_ACOES[acao];
  const gestor = ehGestor(usuario.papel);
  const deOutraPessoa = tarefa.responsavelId !== null && tarefa.responsavelId !== usuario.id;

  // O caso mais comum de conflito vem primeiro, com a mensagem mais útil para o operador
  if (acao === 'ACEITAR' && deOutraPessoa) return 'Esta tarefa já foi assumida por outra pessoa';
  if (!regra.de.includes(tarefa.status)) {
    return `Não é possível ${NOMES_ACOES[acao].toLowerCase()} uma tarefa ${NOMES_STATUS[tarefa.status].toLowerCase()}`;
  }
  if (regra.somenteGestor && !gestor) return 'Somente o gestor pode fazer isso';
  if (regra.exigeMotivo && !motivo?.trim()) return 'Informe o motivo';

  if (deOutraPessoa && !gestor) return 'Esta tarefa foi assumida por outra pessoa';
  return null;
}

export const NOMES_ACOES: Record<AcaoTarefa, string> = {
  ACEITAR: 'Aceitar',
  INICIAR: 'Iniciar',
  CONCLUIR: 'Concluir',
  DEVOLVER: 'Devolver',
  IMPEDIR: 'Informar impedimento',
  CANCELAR: 'Cancelar',
  REABRIR: 'Reabrir',
};

export const NOMES_STATUS: Record<Status, string> = {
  GERADA: 'Pendente',
  ACEITA: 'Aceita',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  IMPEDIDA: 'Impedida',
  OBSOLETA: 'Obsoleta',
};

// ─── Eventos de tarefa na outbox (dados validados pela API) ───────────────────

const motivoSchema = z.string().trim().min(3, 'Motivo muito curto').max(500);

/** Uma pessoa agiu sobre a tarefa (aceitar, iniciar, concluir...). */
export const dadosAcaoTarefaSchema = z
  .object({
    tarefaId: z.uuid(),
    acao: acaoTarefaSchema,
    motivo: motivoSchema.optional(),
  })
  .refine((dados) => !REGRAS_ACOES[dados.acao].exigeMotivo || dados.motivo !== undefined, {
    message: 'Informe o motivo',
    path: ['motivo'],
  });
export type DadosAcaoTarefa = z.infer<typeof dadosAcaoTarefaSchema>;

/**
 * Tarefa criada no corredor (o operador bipa o produto e abre uma tarefa para a equipe).
 * O id é gerado NO APARELHO: a tarefa já existe offline, antes de chegar ao servidor.
 */
export const dadosCriarTarefaSchema = z.object({
  tarefaId: z.uuid(),
  tipo: tipoTarefaSchema,
  titulo: z.string().trim().min(3, 'Título muito curto').max(120),
  descricao: z.string().trim().max(1000).optional(),
  produtoId: z.uuid().optional(),
  prioridade: z.number().int().min(0).max(100).default(0),
});
export type DadosCriarTarefa = z.infer<typeof dadosCriarTarefaSchema>;

// ─── Rotas REST (fila do gestor, criação e redistribuição) ────────────────────

/** Criação pelo gestor (online): pode já definir responsável e prazo. */
export const criarTarefaRequestSchema = dadosCriarTarefaSchema.omit({ tarefaId: true }).extend({
  responsavelId: z.uuid().optional(),
  prazo: z.iso.datetime({ offset: true }).optional(),
});
export type CriarTarefaRequest = z.infer<typeof criarTarefaRequestSchema>;

export const atribuirTarefaRequestSchema = z.object({
  /** null = devolve para a fila, sem responsável */
  responsavelId: z.uuid().nullable(),
});
export type AtribuirTarefaRequest = z.infer<typeof atribuirTarefaRequestSchema>;

export const filaTarefasQuerySchema = z.object({
  status: statusTarefaSchema.optional(),
  tipo: tipoTarefaSchema.optional(),
  responsavelId: z.uuid().optional(),
  /** true = só as atrasadas (prazo vencido e ainda abertas) */
  atrasadas: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});
export type FilaTarefasQuery = z.infer<typeof filaTarefasQuerySchema>;

export const tarefaResumoSchema = z.object({
  id: z.uuid(),
  tipo: tipoTarefaSchema,
  status: statusTarefaSchema,
  origem: z.enum(['AUTOMATICA', 'MANUAL']),
  prioridade: z.number().int(),
  titulo: z.string(),
  descricao: z.string().nullable(),
  produtoId: z.uuid().nullable(),
  loteId: z.uuid().nullable(),
  responsavelId: z.uuid().nullable(),
  /** Nome de quem assumiu (a fila do gestor mostra "quem está com a tarefa") */
  responsavelNome: z.string().nullable(),
  prazo: z.iso.datetime().nullable(),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});
export type TarefaResumo = z.infer<typeof tarefaResumoSchema>;

export const eventoTarefaSchema = z.object({
  id: z.uuid(),
  statusAnterior: statusTarefaSchema.nullable(),
  statusNovo: statusTarefaSchema,
  usuarioNome: z.string().nullable(),
  motivo: z.string().nullable(),
  ocorridoEm: z.iso.datetime(),
  recebidoEm: z.iso.datetime(),
});

export const tarefaDetalheSchema = tarefaResumoSchema.extend({
  /** Histórico completo, do mais antigo ao mais recente (auditoria: quem fez o quê e quando) */
  eventos: z.array(eventoTarefaSchema),
});
export type TarefaDetalhe = z.infer<typeof tarefaDetalheSchema>;

export const resumoFilaSchema = z.object({
  pendentes: z.number().int(),
  aceitas: z.number().int(),
  emExecucao: z.number().int(),
  impedidas: z.number().int(),
  atrasadas: z.number().int(),
  /** Concluídas nas últimas 24 horas (o "hoje" de cada loja depende do fuso; fica para os relatórios) */
  concluidas24h: z.number().int(),
});
export type ResumoFila = z.infer<typeof resumoFilaSchema>;
