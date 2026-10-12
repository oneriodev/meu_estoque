import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Banco LOCAL do aparelho (SQLite). Guarda a cópia dos dados da loja para o app
 * funcionar sem internet, mais a fila de eventos a enviar (outbox).
 *
 * Regras do offline-first:
 * - catálogo, preços, saldos e lotes são CÓPIAS do servidor: o app só lê e substitui pelo que vier no pull;
 * - o que o operador faz vira EVENTO na outbox; quem calcula saldos e status é sempre o servidor.
 *
 * Dinheiro e quantidades ficam como TEXTO ("28.79"), exatamente como chegam da API.
 * SQLite não tem tipo decimal: guardar como REAL (float) arredondaria centavos.
 */

// ─── Cópia do servidor (pull) ─────────────────────────────────────────────────

export const categorias = sqliteTable('categorias', {
  id: text('id').primaryKey(),
  codigoErp: text('codigo_erp').notNull(),
  nome: text('nome').notNull(),
  paiId: text('pai_id'),
});

export const produtos = sqliteTable(
  'produtos',
  {
    id: text('id').primaryKey(),
    codigoErp: text('codigo_erp').notNull(),
    descricao: text('descricao').notNull(),
    /**
     * A descrição em minúsculas e sem acentos (normalizarBusca do shared), preenchida no pull.
     * O LIKE do SQLite não ignora acentos: sem esta coluna, "feijao" não acharia "Feijão".
     */
    descricaoBusca: text('descricao_busca').notNull().default(''),
    categoriaId: text('categoria_id').notNull(),
    unidade: text('unidade', { enum: ['UN', 'KG'] }).notNull(),
    // SQLite não tem booleano: o Drizzle converte 0/1 para false/true
    controlaLote: integer('controla_lote', { mode: 'boolean' }).notNull(),
  },
  (tabela) => [
    index('produtos_descricao_idx').on(tabela.descricao),
    index('produtos_codigo_erp_idx').on(tabela.codigoErp),
  ],
);

export const eans = sqliteTable(
  'eans',
  {
    id: text('id').primaryKey(),
    codigo: text('codigo').notNull(),
    produtoId: text('produto_id').notNull(),
    quantidadeEmbalagem: integer('quantidade_embalagem').notNull(),
  },
  // A busca mais comum do app: "bipei este código, que produto é?"
  (tabela) => [
    index('eans_codigo_idx').on(tabela.codigo),
    index('eans_produto_idx').on(tabela.produtoId),
  ],
);

/** O aparelho guarda os dados de UMA loja por vez, então o produto basta como chave. */
export const produtosLoja = sqliteTable('produtos_loja', {
  produtoId: text('produto_id').primaryKey(),
  preco: text('preco').notNull(),
  saldo: text('saldo').notNull(),
  endereco: text('endereco'),
});

export const lotes = sqliteTable(
  'lotes',
  {
    id: text('id').primaryKey(),
    produtoId: text('produto_id').notNull(),
    codigo: text('codigo').notNull(),
    /** "AAAA-MM-DD": texto nesse formato ordena certo (2026-01-05 < 2026-11-30) */
    validade: text('validade').notNull(),
    quantidadeEstimada: text('quantidade_estimada').notNull(),
  },
  (tabela) => [
    index('lotes_produto_idx').on(tabela.produtoId),
    index('lotes_validade_idx').on(tabela.validade),
  ],
);

// ─── Fila de saída (outbox) ───────────────────────────────────────────────────

/**
 * Cada ação do operador vira uma linha aqui ANTES de qualquer tentativa de envio.
 * Assim nada se perde se a internet cair, o app fechar ou a bateria acabar.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    /** UUID gerado no aparelho: a chave de idempotência que o servidor usa */
    id: text('id').primaryKey(),
    /** A loja e o usuário em que o evento aconteceu (o aparelho pode ser compartilhado) */
    lojaId: text('loja_id').notNull(),
    usuarioId: text('usuario_id').notNull(),
    tipo: text('tipo').notNull(),
    /** Os dados do evento em JSON */
    dados: text('dados').notNull(),
    /** Horário do aparelho quando o fato aconteceu (ISO 8601) */
    ocorridoEm: text('ocorrido_em').notNull(),
    /** Ordem de criação: os eventos são enviados na ordem em que aconteceram */
    sequencia: integer('sequencia').notNull(),
    situacao: text('situacao', { enum: ['PENDENTE', 'REJEITADO'] })
      .notNull()
      .default('PENDENTE'),
    tentativas: integer('tentativas').notNull().default(0),
    /** Momento (ms) a partir do qual pode tentar de novo: a espera cresce a cada falha */
    proximaTentativaEm: integer('proxima_tentativa_em').notNull().default(0),
    /** Última falha (rede) ou motivo da rejeição (servidor) */
    ultimoErro: text('ultimo_erro'),
  },
  (tabela) => [index('outbox_fila_idx').on(tabela.situacao, tabela.sequencia)],
);

// ─── Estado da sincronização ──────────────────────────────────────────────────

/** Pares chave → valor: cursor do pull, loja dos dados locais, horário da última sincronização. */
export const estadoSincronizacao = sqliteTable('estado_sincronizacao', {
  chave: text('chave').primaryKey(),
  valor: text('valor').notNull(),
});
