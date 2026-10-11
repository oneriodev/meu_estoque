import { tokensResponseSchema, type TokensResponse } from '@meu-estoque/shared';
import type { z } from 'zod';
import { armazenamentoSeguro } from './armazenamentoSeguro';
import { API_URL } from './config';

const CHAVE_REFRESH = 'meuEstoque.refreshToken';
/** Tempo máximo de espera por uma resposta. Sem isso, uma rede ruim deixaria a tela presa. */
const TEMPO_LIMITE_MS = 15_000;

/** Erro de uma chamada à API. status 0 = não houve resposta (sem rede, servidor fora, tempo esgotado). */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
// O access token (15 min) fica SÓ na memória: se o app fechar, ele some e
// pedimos outro com o refresh token. O refresh token (30 dias) fica no cofre.
let accessToken: string | null = null;

/** Promise da renovação em andamento, compartilhada por todas as chamadas (ver renovarTokens). */
let renovacaoEmAndamento: Promise<boolean> | null = null;

/** Função chamada quando a sessão acaba de vez (o store da sessão se registra aqui). */
let aoSessaoExpirar: (() => void) | null = null;

export function definirAoSessaoExpirar(callback: () => void): void {
  aoSessaoExpirar = callback;
}

export async function guardarTokens(tokens: TokensResponse): Promise<void> {
  accessToken = tokens.accessToken;
  await armazenamentoSeguro.salvar(CHAVE_REFRESH, tokens.refreshToken);
}

export function lerRefreshToken(): Promise<string | null> {
  return armazenamentoSeguro.ler(CHAVE_REFRESH);
}

export async function limparTokens(): Promise<void> {
  accessToken = null;
  await armazenamentoSeguro.remover(CHAVE_REFRESH);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/** fetch com tempo limite. Falha de rede vira ErroApi com status 0. */
async function enviar(caminho: string, init: RequestInit): Promise<Response> {
  const controle = new AbortController();
  const temporizador = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    return await fetch(`${API_URL}${caminho}`, { ...init, signal: controle.signal });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor');
  } finally {
    clearTimeout(temporizador);
  }
}

/** Extrai a mensagem de erro do NestJS ({ message: string | string[] }). */
async function erroDaResposta(resposta: Response): Promise<ErroApi> {
  let mensagem = `Erro ${resposta.status}`;
  try {
    const corpo = (await resposta.json()) as { message?: unknown };
    if (typeof corpo.message === 'string') mensagem = corpo.message;
    else if (Array.isArray(corpo.message)) mensagem = corpo.message.join('; ');
  } catch {
    // Corpo vazio ou que não é JSON: fica a mensagem genérica
  }
  return new ErroApi(resposta.status, mensagem);
}

/**
 * Troca o refresh token por um par novo.
 * Devolve false quando a sessão não vale mais (401) e lança ErroApi quando não há rede.
 *
 * "Single flight": se três telas recebem 401 ao mesmo tempo, só UMA renovação vai
 * ao servidor e as outras esperam a mesma Promise. Isso é importante porque a API
 * faz rotação do refresh token: se o mesmo token fosse usado duas vezes, ela
 * entenderia como roubo e encerraria a sessão inteira.
 */
export function renovarTokens(): Promise<boolean> {
  renovacaoEmAndamento ??= (async () => {
    const refreshToken = await lerRefreshToken();
    if (!refreshToken) return false;

    const resposta = await enviar('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (resposta.status === 401) {
      await limparTokens();
      return false;
    }
    if (!resposta.ok) throw await erroDaResposta(resposta);

    await guardarTokens(tokensResponseSchema.parse(await resposta.json()));
    return true;
  })().finally(() => {
    renovacaoEmAndamento = null;
  });
  return renovacaoEmAndamento;
}

interface OpcoesApi<T> {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  /** Schema Zod que valida a resposta. A API é nossa, mas o app não confia cegamente. */
  schema?: z.ZodType<T>;
  /** false para rotas públicas (login). */
  autenticado?: boolean;
}

/**
 * Chamada à API com tudo o que se repete: cabeçalhos, token, tempo limite,
 * renovação automática quando o token vence e validação da resposta.
 */
export async function api<T = void>(caminho: string, opcoes: OpcoesApi<T> = {}): Promise<T> {
  const { metodo = 'GET', corpo, schema, autenticado = true } = opcoes;

  // App acabou de abrir: ainda não há access token, então pegamos um antes
  if (autenticado && !accessToken) await renovarOuEncerrar();

  const chamar = () =>
    enviar(caminho, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(autenticado && accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });

  let resposta = await chamar();

  // Token venceu no meio do uso: renova e tenta UMA vez de novo
  if (resposta.status === 401 && autenticado) {
    await renovarOuEncerrar();
    resposta = await chamar();
  }

  if (!resposta.ok) throw await erroDaResposta(resposta);
  if (resposta.status === 204) return undefined as T;

  const dados: unknown = await resposta.json();
  return schema ? schema.parse(dados) : (dados as T);
}

async function renovarOuEncerrar(): Promise<void> {
  const renovou = await renovarTokens();
  if (!renovou) {
    aoSessaoExpirar?.();
    throw new ErroApi(401, 'Sua sessão expirou. Entre novamente.');
  }
}
