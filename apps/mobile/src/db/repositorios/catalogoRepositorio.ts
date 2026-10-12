import type { Alteracoes } from '@meu-estoque/shared';
import { count, getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { bancoLocal, type TransacaoLocal } from '../cliente';
import { categorias, eans, lotes, produtos, produtosLoja } from '../schema';
import { apagarEstado, gravarEstado } from './estadoRepositorio';

/**
 * Quantas linhas por INSERT. O SQLite limita a quantidade de parâmetros ("?") por comando,
 * então gravamos em blocos.
 */
const TAMANHO_BLOCO = 100;

function emBlocos<T>(itens: T[], tamanho = TAMANHO_BLOCO): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

/**
 * Monta o "SET" do upsert: em caso de conflito na chave, cada coluna recebe o valor novo
 * (no SQLite, "excluded" é a linha que tentamos inserir).
 */
function atualizarTudoMenos(tabela: SQLiteTable, chave: SQLiteColumn): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(tabela))
      .filter(([, coluna]) => coluna.name !== chave.name)
      .map(([nome, coluna]) => [nome, sql.raw(`excluded."${coluna.name}"`)]),
  );
}

/**
 * Grava uma lista de registros vindos do pull: os não excluídos são inseridos ou atualizados
 * (upsert), os excluídos são apagados da cópia local.
 */
function aplicar<T extends { excluido: boolean }, L extends Record<string, unknown>>(
  tx: TransacaoLocal,
  tabela: SQLiteTable,
  chave: SQLiteColumn,
  registros: T[],
  idDe: (registro: T) => string,
  paraLinha: (registro: T) => L,
): void {
  const ativos = registros.filter((r) => !r.excluido).map(paraLinha);
  const excluidos = registros.filter((r) => r.excluido).map(idDe);

  for (const bloco of emBlocos(ativos)) {
    tx.insert(tabela)
      .values(bloco as never)
      .onConflictDoUpdate({ target: chave, set: atualizarTudoMenos(tabela, chave) as never })
      .run();
  }
  for (const bloco of emBlocos(excluidos)) {
    tx.delete(tabela).where(inArray(chave, bloco)).run();
  }
}

/**
 * Aplica uma página do pull E salva o cursor na MESMA transação.
 * Se o app fechar no meio, ou grava a página inteira com o cursor novo, ou nada:
 * nunca fica "dado novo com cursor velho" (baixaria de novo, sem problema)
 * nem "cursor novo sem os dados" (perderia a página para sempre).
 */
export function aplicarPagina(alteracoes: Alteracoes, cursor: string): number {
  bancoLocal().transaction((tx) => {
    aplicar(
      tx,
      categorias,
      categorias.id,
      alteracoes.categorias,
      (c) => c.id,
      (c) => ({
        id: c.id,
        codigoErp: c.codigoErp,
        nome: c.nome,
        paiId: c.paiId,
      }),
    );
    aplicar(
      tx,
      produtos,
      produtos.id,
      alteracoes.produtos,
      (p) => p.id,
      (p) => ({
        id: p.id,
        codigoErp: p.codigoErp,
        descricao: p.descricao,
        categoriaId: p.categoriaId,
        unidade: p.unidade,
        controlaLote: p.controlaLote,
      }),
    );
    aplicar(
      tx,
      eans,
      eans.id,
      alteracoes.eans,
      (e) => e.id,
      (e) => ({
        id: e.id,
        codigo: e.codigo,
        produtoId: e.produtoId,
        quantidadeEmbalagem: e.quantidadeEmbalagem,
      }),
    );
    aplicar(
      tx,
      produtosLoja,
      produtosLoja.produtoId,
      alteracoes.produtosLoja,
      (p) => p.produtoId,
      (p) => ({ produtoId: p.produtoId, preco: p.preco, saldo: p.saldo, endereco: p.endereco }),
    );
    aplicar(
      tx,
      lotes,
      lotes.id,
      alteracoes.lotes,
      (l) => l.id,
      (l) => ({
        id: l.id,
        produtoId: l.produtoId,
        codigo: l.codigo,
        validade: l.validade,
        quantidadeEstimada: l.quantidadeEstimada,
      }),
    );
    gravarEstado('cursor', cursor, tx);
  });

  return Object.values(alteracoes).reduce((total, lista) => total + lista.length, 0);
}

/**
 * Apaga a cópia local (troca de loja ou cursor recusado pelo servidor).
 * A outbox NÃO é apagada: eventos pendentes ainda precisam ser enviados.
 */
export function limparCopiaLocal(): void {
  bancoLocal().transaction((tx) => {
    for (const tabela of [categorias, produtos, eans, produtosLoja, lotes]) {
      tx.delete(tabela).run();
    }
    apagarEstado('cursor', tx);
    apagarEstado('lojaId', tx);
    apagarEstado('ultimaSincronizacao', tx);
  });
}

export interface ContagemLocal {
  produtos: number;
  eans: number;
  lotes: number;
}

export function contarCopiaLocal(): ContagemLocal {
  const contar = (tabela: SQLiteTable) =>
    bancoLocal().select({ total: count() }).from(tabela).get()?.total ?? 0;
  return { produtos: contar(produtos), eans: contar(eans), lotes: contar(lotes) };
}
