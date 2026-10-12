import { create } from 'zustand';
import { contarCopiaLocal, type ContagemLocal } from '@/db/repositorios/catalogoRepositorio';
import { lerEstado } from '@/db/repositorios/estadoRepositorio';
import { contarFila, enfileirar, liberarEsperas } from '@/db/repositorios/outboxRepositorio';
import { ErroApi } from '@/services/api';
import { enviarFila, puxarAlteracoes } from '@/services/sincronizacaoService';
import { useSessaoStore } from './sessaoStore';

type Situacao = 'parado' | 'sincronizando' | 'offline' | 'erro';

interface EstadoSincronizacao {
  situacao: Situacao;
  /** Registros recebidos na rodada atual (para a barra de progresso da carga inicial) */
  recebidos: number;
  mensagemErro: string | null;
  /** Horário do servidor na última sincronização completa (ISO) */
  ultimaSincronizacao: string | null;
  pendentes: number;
  rejeitados: number;
  copiaLocal: ContagemLocal;

  sincronizar: (opcoes?: { forcar?: boolean }) => Promise<void>;
  registrarEvento: (tipo: string, dados: unknown) => void;
  atualizarContagens: () => void;
}

/** A rodada em andamento, compartilhada por quem pedir sincronização ao mesmo tempo. */
let rodadaAtual: Promise<void> | null = null;

/**
 * Estado e orquestração da sincronização.
 * Ordem de cada rodada: primeiro ENVIA (push) o que o operador fez, depois BAIXA (pull).
 * Assim o pull já traz o resultado das ações que acabaram de chegar ao servidor.
 */
export const useSincronizacaoStore = create<EstadoSincronizacao>()((set, get) => ({
  situacao: 'parado',
  recebidos: 0,
  mensagemErro: null,
  ultimaSincronizacao: null,
  pendentes: 0,
  rejeitados: 0,
  copiaLocal: { produtos: 0, eans: 0, lotes: 0 },

  sincronizar({ forcar = false } = {}) {
    // Single flight: se já há uma rodada, quem pediu espera a mesma
    rodadaAtual ??= (async () => {
      const { usuario, loja } = useSessaoStore.getState();
      if (!usuario || !loja) return;

      if (forcar) liberarEsperas(usuario.id);
      set({ situacao: 'sincronizando', recebidos: 0, mensagemErro: null });
      try {
        await enviarFila(usuario.id);
        get().atualizarContagens();
        await puxarAlteracoes(loja.id, (recebidos) => set({ recebidos }));
        set({ situacao: 'parado' });
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status === 0) {
          set({ situacao: 'offline' }); // normal no depósito: os dados locais continuam valendo
        } else {
          set({
            situacao: 'erro',
            mensagemErro: erro instanceof Error ? erro.message : 'Erro na sincronização',
          });
        }
      } finally {
        get().atualizarContagens();
      }
    })().finally(() => {
      rodadaAtual = null;
    });
    return rodadaAtual;
  },

  /** Registra uma ação do operador na outbox e tenta enviar na hora (se houver rede). */
  registrarEvento(tipo, dados) {
    const { usuario, loja } = useSessaoStore.getState();
    if (!usuario || !loja) return;
    enfileirar({ tipo, dados, lojaId: loja.id, usuarioId: usuario.id });
    get().atualizarContagens();
    void get().sincronizar();
  },

  atualizarContagens() {
    const usuario = useSessaoStore.getState().usuario;
    const fila = usuario ? contarFila(usuario.id) : { pendentes: 0, rejeitados: 0 };
    set({
      ...fila,
      copiaLocal: contarCopiaLocal(),
      ultimaSincronizacao: lerEstado('ultimaSincronizacao'),
    });
  },
}));
