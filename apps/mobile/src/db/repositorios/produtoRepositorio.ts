import { palavrasDaBusca, variantesGtin, type LeituraCodigo } from '@meu-estoque/shared';
import { and, asc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { bancoLocal } from '../cliente';
import { categorias, eans, lotes, produtos, produtosLoja } from '../schema';

/** Uma linha da lista de resultados: o essencial para o operador reconhecer o produto. */
export interface ProdutoResumo {
  id: string;
  codigoErp: string;
  descricao: string;
  unidade: 'UN' | 'KG';
  /** null quando o produto não tem posição nesta loja (não é vendido aqui) */
  preco: string | null;
  saldo: string | null;
  endereco: string | null;
}

/** Colunas do resumo: produto + posição na loja (LEFT JOIN: aparece mesmo sem posição). */
const colunasResumo = {
  id: produtos.id,
  codigoErp: produtos.codigoErp,
  descricao: produtos.descricao,
  unidade: produtos.unidade,
  preco: produtosLoja.preco,
  saldo: produtosLoja.saldo,
  endereco: produtosLoja.endereco,
};

function resumos(onde: SQL | undefined, limite: number): ProdutoResumo[] {
  return bancoLocal()
    .select(colunasResumo)
    .from(produtos)
    .leftJoin(produtosLoja, eq(produtosLoja.produtoId, produtos.id))
    .where(onde)
    .orderBy(asc(produtos.descricao))
    .limit(limite)
    .all();
}

/**
 * Busca por texto, sem internet: cada palavra digitada precisa aparecer na descrição
 * (em qualquer ordem, sem ligar para acentos e maiúsculas). "feijao 1kg" acha "Feijão carioca 1kg".
 * Só números? Também procura pelo código do produto no ERP e pelo começo do EAN.
 */
export function buscarPorTexto(texto: string, limite = 50): ProdutoResumo[] {
  const palavras = palavrasDaBusca(texto);
  if (palavras.length === 0) return [];

  // O "%" do LIKE é coringa: "%feijao%" = contém "feijao" em qualquer posição.
  // Os valores vão como PARÂMETROS (o Drizzle usa "?"), nunca colados no SQL: sem risco de injeção.
  const porDescricao = and(...palavras.map((palavra) => contem(produtos.descricaoBusca, palavra)));

  const somenteDigitos = /^\d+$/.test(texto.trim());
  if (!somenteDigitos) return resumos(porDescricao, limite);

  const digitos = texto.trim();
  const produtosComEan = bancoLocal()
    .selectDistinct({ id: eans.produtoId })
    .from(eans)
    .where(like(eans.codigo, `${digitos}%`));
  return resumos(
    or(porDescricao, eq(produtos.codigoErp, digitos), inArray(produtos.id, produtosComEan)),
    limite,
  );
}

/**
 * "coluna contém o texto". No LIKE, "%" e "_" são coringas: se o usuário digitar um deles,
 * escapamos com "\\" (e o ESCAPE avisa o SQLite que a barra é o caractere de escape).
 */
function contem(coluna: SQLiteColumn, texto: string): SQL {
  const escapado = texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
  return sql`${coluna} LIKE ${`%${escapado}%`} ESCAPE '\\'`;
}

export interface ResultadoLeitura {
  produto: ProdutoResumo;
  /** Quantas unidades o código representa (1 = unidade; 6 = caixa com 6) */
  quantidadeEmbalagem: number;
}

/**
 * Encontra o produto de um código lido (câmera ou coletor).
 * - GTIN e GS1: procura o EAN em todas as formas equivalentes (13 ou 14 dígitos).
 * - Balança: primeiro tenta o código inteiro como EAN (embalados na loja com preço fixo);
 *   não achando, usa o código do produto embutido na etiqueta.
 */
export function buscarPorLeitura(leitura: LeituraCodigo): ResultadoLeitura | null {
  switch (leitura.tipo) {
    case 'GTIN':
      return buscarPorEan(leitura.codigo);
    case 'GS1':
      return leitura.gtin ? buscarPorEan(leitura.gtin) : null;
    case 'BALANCA': {
      const porEan = buscarPorEan(leitura.codigo);
      if (porEan) return porEan;
      // O código interno pode estar no ERP com zeros à esquerda ("010016") ou sem ("10016")
      const [produto] = resumos(
        sql`ltrim(${produtos.codigoErp}, '0') = ${leitura.codigoProduto}`,
        1,
      );
      return produto ? { produto, quantidadeEmbalagem: 1 } : null;
    }
    case 'INVALIDO':
      return null;
  }
}

function buscarPorEan(codigo: string): ResultadoLeitura | null {
  const ean = bancoLocal()
    .select({ produtoId: eans.produtoId, quantidadeEmbalagem: eans.quantidadeEmbalagem })
    .from(eans)
    .where(inArray(eans.codigo, variantesGtin(codigo)))
    .get();
  if (!ean) return null;
  const [produto] = resumos(eq(produtos.id, ean.produtoId), 1);
  return produto ? { produto, quantidadeEmbalagem: ean.quantidadeEmbalagem } : null;
}

export interface ProdutoDetalhe extends ProdutoResumo {
  categoria: string | null;
  controlaLote: boolean;
  codigos: { codigo: string; quantidadeEmbalagem: number }[];
  /** Ordenados pela validade: o primeiro é o que deve sair primeiro da gôndola (FEFO) */
  lotes: { id: string; codigo: string; validade: string; quantidadeEstimada: string }[];
}

/** Tudo o que o aparelho sabe sobre um produto, para a tela de detalhe. */
export function detalharProduto(produtoId: string): ProdutoDetalhe | null {
  const banco = bancoLocal();
  const base = banco
    .select({
      ...colunasResumo,
      controlaLote: produtos.controlaLote,
      categoria: categorias.nome,
    })
    .from(produtos)
    .leftJoin(produtosLoja, eq(produtosLoja.produtoId, produtos.id))
    .leftJoin(categorias, eq(categorias.id, produtos.categoriaId))
    .where(eq(produtos.id, produtoId))
    .get();
  if (!base) return null;

  const codigos = banco
    .select({ codigo: eans.codigo, quantidadeEmbalagem: eans.quantidadeEmbalagem })
    .from(eans)
    .where(eq(eans.produtoId, produtoId))
    .orderBy(asc(eans.quantidadeEmbalagem))
    .all();

  const lotesDoProduto = banco
    .select({
      id: lotes.id,
      codigo: lotes.codigo,
      validade: lotes.validade,
      quantidadeEstimada: lotes.quantidadeEstimada,
    })
    .from(lotes)
    .where(eq(lotes.produtoId, produtoId))
    // "AAAA-MM-DD" em texto ordena igual a data: FEFO (o que vence primeiro sai primeiro)
    .orderBy(asc(lotes.validade))
    .all();

  return { ...base, codigos, lotes: lotesDoProduto };
}
