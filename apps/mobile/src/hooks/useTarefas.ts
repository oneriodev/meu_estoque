import {
  listarRecusas,
  listarTarefas,
  type Recusa,
  type TarefaLocal,
} from '@/db/repositorios/tarefaRepositorio';
import { useSessaoStore } from '@/stores/sessaoStore';
import { useConsultaLocal } from './useConsultaLocal';

/**
 * Tarefas da loja como a pessoa deve vê-las (servidor + ações ainda não enviadas).
 * Recalcula sozinho quando o banco local muda.
 */
export function useTarefas(): { tarefas: TarefaLocal[]; recusas: Recusa[] } {
  const usuario = useSessaoStore((s) => s.usuario);
  return useConsultaLocal(
    () =>
      usuario
        ? { tarefas: listarTarefas(usuario), recusas: listarRecusas(usuario.id) }
        : { tarefas: [], recusas: [] },
    [usuario],
  );
}
