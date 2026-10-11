import {
  loginResponseSchema,
  usuarioSessaoSchema,
  type LoginRequest,
  type UsuarioSessao,
} from '@meu-estoque/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, guardarTokens, lerRefreshToken, limparTokens } from './api';

/**
 * Identificação do aparelho enviada no login (ajuda a reconhecer a sessão depois).
 * LGPD: usamos só o sistema e a versão do app, e NÃO o nome do aparelho,
 * que muitas vezes é pessoal (ex.: "Celular do João").
 */
function descreverDispositivo(): string {
  const sistema = Platform.OS === 'android' ? 'Android' : Platform.OS;
  return `${sistema} · app ${Constants.expoConfig?.version ?? '?'}`;
}

export async function entrar(dados: LoginRequest): Promise<UsuarioSessao> {
  const resposta = await api('/auth/login', {
    metodo: 'POST',
    corpo: { ...dados, dispositivo: descreverDispositivo() },
    schema: loginResponseSchema,
    autenticado: false,
  });
  await guardarTokens(resposta);
  return resposta.usuario;
}

export function carregarUsuario(): Promise<UsuarioSessao> {
  return api('/auth/me', { schema: usuarioSessaoSchema });
}

/** Encerra a sessão no servidor (se houver rede) e apaga os tokens do aparelho. */
export async function sair(): Promise<void> {
  const refreshToken = await lerRefreshToken();
  if (refreshToken) {
    try {
      await api('/auth/logout', { metodo: 'POST', corpo: { refreshToken }, autenticado: false });
    } catch {
      // Sem rede: apagamos localmente mesmo assim. O token no servidor vence sozinho.
    }
  }
  await limparTokens();
}
