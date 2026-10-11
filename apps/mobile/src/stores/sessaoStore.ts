import {
  lojaResumoSchema,
  usuarioSessaoSchema,
  type LoginRequest,
  type LojaResumo,
  type UsuarioSessao,
} from '@meu-estoque/shared';
import { z } from 'zod';
import { create } from 'zustand';
import { ErroApi, definirAoSessaoExpirar, lerRefreshToken, limparTokens } from '@/services/api';
import { armazenamentoSeguro } from '@/services/armazenamentoSeguro';
import * as authService from '@/services/authService';

const CHAVE_SESSAO = 'meuEstoque.sessao';

/**
 * Cópia da sessão guardada no aparelho, para o app abrir mesmo SEM internet
 * (offline-first). É validada com Zod na leitura: se o formato mudar numa
 * versão nova do app, a cópia antiga é descartada em vez de quebrar a tela.
 */
const sessaoSalvaSchema = z.object({
  usuario: usuarioSessaoSchema,
  loja: lojaResumoSchema.nullable(),
});
type SessaoSalva = z.infer<typeof sessaoSalvaSchema>;

type Situacao = 'iniciando' | 'deslogado' | 'logado';

interface EstadoSessao {
  situacao: Situacao;
  usuario: UsuarioSessao | null;
  /** Loja em que o usuário está trabalhando agora */
  loja: LojaResumo | null;

  restaurar: () => Promise<void>;
  entrar: (dados: LoginRequest) => Promise<void>;
  escolherLoja: (loja: LojaResumo) => Promise<void>;
  trocarLoja: () => Promise<void>;
  sair: () => Promise<void>;
  encerrarLocalmente: () => Promise<void>;
}

/** Com uma loja só, não faz sentido perguntar: ela já vem escolhida. */
function lojaAutomatica(usuario: UsuarioSessao): LojaResumo | null {
  return usuario.lojas.length === 1 ? (usuario.lojas[0] ?? null) : null;
}

async function salvar(sessao: SessaoSalva): Promise<void> {
  await armazenamentoSeguro.salvar(CHAVE_SESSAO, JSON.stringify(sessao));
}

async function lerSessaoSalva(): Promise<SessaoSalva | null> {
  const texto = await armazenamentoSeguro.ler(CHAVE_SESSAO);
  if (!texto) return null;
  try {
    const resultado = sessaoSalvaSchema.safeParse(JSON.parse(texto));
    return resultado.success ? resultado.data : null;
  } catch {
    return null; // JSON corrompido
  }
}

/**
 * Store da sessão (Zustand). Um store é um estado GLOBAL: qualquer tela lê
 * com useSessaoStore((s) => s.usuario) e é redesenhada quando esse valor muda.
 */
export const useSessaoStore = create<EstadoSessao>()((set, get) => ({
  situacao: 'iniciando',
  usuario: null,
  loja: null,

  /** Chamado uma vez quando o app abre. */
  async restaurar() {
    const [refreshToken, salva] = await Promise.all([lerRefreshToken(), lerSessaoSalva()]);
    if (!refreshToken || !salva) {
      await get().encerrarLocalmente();
      return;
    }

    // 1) Abre na hora com a cópia local: funciona até na câmara fria, sem sinal
    set({ situacao: 'logado', usuario: salva.usuario, loja: salva.loja });

    // 2) Em segundo plano, confirma com o servidor e atualiza perfil e lojas
    try {
      const usuario = await authService.carregarUsuario();
      // A loja escolhida pode ter sido retirada do usuário pelo gestor
      const loja = usuario.lojas.find((l) => l.id === get().loja?.id) ?? lojaAutomatica(usuario);
      set({ usuario, loja });
      await salvar({ usuario, loja });
    } catch (erro) {
      // 401 já encerrou a sessão (via aoSessaoExpirar). Sem rede: seguimos offline.
      if (!(erro instanceof ErroApi)) throw erro;
    }
  },

  async entrar(dados) {
    const usuario = await authService.entrar(dados);
    const loja = lojaAutomatica(usuario);
    await salvar({ usuario, loja });
    set({ situacao: 'logado', usuario, loja });
  },

  async escolherLoja(loja) {
    const { usuario } = get();
    // Defesa extra: só aceita lojas que vieram da API para este usuário
    if (!usuario?.lojas.some((l) => l.id === loja.id)) return;
    await salvar({ usuario, loja });
    set({ loja });
  },

  async trocarLoja() {
    const { usuario } = get();
    if (!usuario) return;
    await salvar({ usuario, loja: null });
    set({ loja: null });
  },

  async sair() {
    await authService.sair();
    await get().encerrarLocalmente();
  },

  /** Apaga tudo do aparelho sem falar com o servidor (sessão expirada ou revogada). */
  async encerrarLocalmente() {
    await Promise.all([limparTokens(), armazenamentoSeguro.remover(CHAVE_SESSAO)]);
    set({ situacao: 'deslogado', usuario: null, loja: null });
  },
}));

// Quando a API avisa que a sessão acabou (refresh recusado), volta para o login
definirAoSessaoExpirar(() => {
  void useSessaoStore.getState().encerrarLocalmente();
});
