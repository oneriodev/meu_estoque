import { z } from 'zod';

/**
 * Perfis de acesso. Os valores em MAIÚSCULAS vão bater com os
 * enums do Prisma na Etapa 2, para não precisarmos converter nada.
 */
export const papelUsuarioSchema = z.enum(['OPERADOR', 'SUPERVISOR', 'ADMINISTRADOR']);

// z.infer "extrai" o tipo TypeScript a partir do schema:
// PapelUsuario = 'OPERADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
export type PapelUsuario = z.infer<typeof papelUsuarioSchema>;

/** Tipos de tarefa. A lista cresce quando construirmos o motor de análise. */
export const tipoTarefaSchema = z.enum([
  'VALIDADE',
  'REPOSICAO',
  'RUPTURA',
  'CONTAGEM',
  'AUDITORIA_PRECO',
  'MANUAL',
]);
export type TipoTarefa = z.infer<typeof tipoTarefaSchema>;

/** Os 7 estados do ciclo de vida da tarefa (a máquina de estados vem na Etapa 8). */
export const statusTarefaSchema = z.enum([
  'GERADA',
  'ACEITA',
  'EM_EXECUCAO',
  'CONCLUIDA',
  'CANCELADA',
  'IMPEDIDA',
  'OBSOLETA',
]);
export type StatusTarefa = z.infer<typeof statusTarefaSchema>;
