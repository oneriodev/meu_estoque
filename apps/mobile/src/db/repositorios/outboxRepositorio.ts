import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { bancoLocal } from '../cliente';
import { outbox } from '../schema';

export type ItemOutbox = typeof outbox.$inferSelect;

export interface NovoEvento {
  tipo: string;
  dados: unknown;
  lojaId: string;
  usuarioId: string;
}

/** Espera antes de tentar de novo: 5 s, 10 s, 20 s, 40 s... até no máximo 10 minutos. */
export function calcularEspera(tentativas: number): number {
  const base = Math.min(5_000 * 2 ** Math.max(tentativas - 1, 0), 10 * 60_000);
  // "Jitter": ±20% aleatório para os aparelhos da loja não tentarem todos no mesmo segundo
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/**
 * Coloca um evento na fila. É gravado ANTES de qualquer envio: mesmo sem internet,
 * com o app fechado em seguida, ele está salvo no aparelho.
 */
export function enfileirar(evento: NovoEvento): string {
  const id = Crypto.randomUUID();
  bancoLocal().transaction((tx) => {
    const ultima = tx
      .select({ maior: sql<number>`coalesce(max(${outbox.sequencia}), 0)` })
      .from(outbox)
      .get();
    tx.insert(outbox)
      .values({
        id,
        lojaId: evento.lojaId,
        usuarioId: evento.usuarioId,
        tipo: evento.tipo,
        dados: JSON.stringify(evento.dados ?? null),
        ocorridoEm: new Date().toISOString(),
        sequencia: (ultima?.maior ?? 0) + 1,
      })
      .run();
  });
  return id;
}

/**
 * Próximo lote a enviar, NA ORDEM em que os eventos aconteceram.
 * - Só eventos do usuário logado (o aparelho pode ser compartilhado por turnos).
 * - Todos da MESMA loja (a rota de envio é por loja).
 * - Se o primeiro da fila ainda está esperando a próxima tentativa, ninguém passa na frente.
 */
export function proximoLote(usuarioId: string, limite: number, agora = Date.now()): ItemOutbox[] {
  const fila = bancoLocal()
    .select()
    .from(outbox)
    .where(and(eq(outbox.situacao, 'PENDENTE'), eq(outbox.usuarioId, usuarioId)))
    .orderBy(asc(outbox.sequencia))
    .limit(limite)
    .all();

  const primeiro = fila[0];
  if (!primeiro || primeiro.proximaTentativaEm > agora) return [];

  const fimDaLoja = fila.findIndex((item) => item.lojaId !== primeiro.lojaId);
  return fimDaLoja === -1 ? fila : fila.slice(0, fimDaLoja);
}

/** APLICADO ou DUPLICADO: o servidor já tem o evento, pode sair da fila. */
export function removerEnviados(ids: string[]): void {
  if (ids.length === 0) return;
  bancoLocal().delete(outbox).where(inArray(outbox.id, ids)).run();
}

/** REJEITADO: fica guardado para o gestor ver o motivo, mas não é reenviado. */
export function marcarRejeitado(id: string, motivo: string): void {
  bancoLocal()
    .update(outbox)
    .set({ situacao: 'REJEITADO', ultimoErro: motivo })
    .where(eq(outbox.id, id))
    .run();
}

/** Falha de rede ou do servidor: conta a tentativa e agenda a próxima com espera crescente. */
export function registrarFalha(itens: ItemOutbox[], erro: string, agora = Date.now()): void {
  bancoLocal().transaction((tx) => {
    for (const item of itens) {
      const tentativas = item.tentativas + 1;
      tx.update(outbox)
        .set({
          tentativas,
          ultimoErro: erro,
          proximaTentativaEm: agora + calcularEspera(tentativas),
        })
        .where(eq(outbox.id, item.id))
        .run();
    }
  });
}

/** Volta todos os pendentes a "pode tentar já" (ex.: o operador tocou em "Sincronizar agora"). */
export function liberarEsperas(usuarioId: string): void {
  bancoLocal()
    .update(outbox)
    .set({ proximaTentativaEm: 0 })
    .where(and(eq(outbox.situacao, 'PENDENTE'), eq(outbox.usuarioId, usuarioId)))
    .run();
}

export function contarFila(usuarioId: string): { pendentes: number; rejeitados: number } {
  const linhas = bancoLocal()
    .select({ situacao: outbox.situacao, total: count() })
    .from(outbox)
    .where(eq(outbox.usuarioId, usuarioId))
    .groupBy(outbox.situacao)
    .all();
  const total = (situacao: ItemOutbox['situacao']) =>
    linhas.find((linha) => linha.situacao === situacao)?.total ?? 0;
  return { pendentes: total('PENDENTE'), rejeitados: total('REJEITADO') };
}

/** Eventos do usuário de certos tipos e situação, na ordem em que aconteceram. */
export function eventosDoUsuario(
  usuarioId: string,
  tipos: string[],
  situacao: ItemOutbox['situacao'],
): ItemOutbox[] {
  return bancoLocal()
    .select()
    .from(outbox)
    .where(
      and(
        eq(outbox.usuarioId, usuarioId),
        eq(outbox.situacao, situacao),
        inArray(outbox.tipo, tipos),
      ),
    )
    .orderBy(asc(outbox.sequencia))
    .all();
}

/** O operador leu a recusa e dispensou o aviso: o evento rejeitado sai do aparelho. */
export function descartarRejeitado(id: string): void {
  bancoLocal()
    .delete(outbox)
    .where(and(eq(outbox.id, id), eq(outbox.situacao, 'REJEITADO')))
    .run();
}
