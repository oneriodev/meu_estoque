import type { PapelUsuario } from '@meu-estoque/shared';

/**
 * Regras de exibição por perfil. ATENÇÃO: isto só decide o que MOSTRAR.
 * Quem realmente bloqueia é a API (PerfisGuard e EscopoLojaGuard): um usuário
 * que burlasse o app receberia 403 do servidor do mesmo jeito.
 */
export function ehGestor(papel: PapelUsuario | undefined): boolean {
  return papel === 'SUPERVISOR' || papel === 'ADMINISTRADOR';
}

export const nomeDoPapel: Record<PapelUsuario, string> = {
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  ADMINISTRADOR: 'Administrador',
};
