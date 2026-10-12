import { eq } from 'drizzle-orm';
import { bancoLocal, type BancoLocal, type TransacaoLocal } from '../cliente';
import { estadoSincronizacao } from '../schema';

/** As chaves guardadas na tabela estado_sincronizacao. */
export type ChaveEstado = 'cursor' | 'lojaId' | 'ultimaSincronizacao';

export function lerEstado(
  chave: ChaveEstado,
  banco: BancoLocal | TransacaoLocal = bancoLocal(),
): string | null {
  const linha = banco
    .select({ valor: estadoSincronizacao.valor })
    .from(estadoSincronizacao)
    .where(eq(estadoSincronizacao.chave, chave))
    .get();
  return linha?.valor ?? null;
}

export function gravarEstado(
  chave: ChaveEstado,
  valor: string,
  banco: BancoLocal | TransacaoLocal = bancoLocal(),
): void {
  banco
    .insert(estadoSincronizacao)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: estadoSincronizacao.chave, set: { valor } })
    .run();
}

export function apagarEstado(
  chave: ChaveEstado,
  banco: BancoLocal | TransacaoLocal = bancoLocal(),
): void {
  banco.delete(estadoSincronizacao).where(eq(estadoSincronizacao.chave, chave)).run();
}
