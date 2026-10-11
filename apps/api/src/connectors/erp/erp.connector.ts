/**
 * Contrato que TODO conector de ERP precisa cumprir (padrão Adapter).
 *
 * O resto da API só conhece esta interface, nunca um ERP específico.
 * Trocar o Consinco simulado pelo real (ou por outro ERP) é escrever
 * uma nova classe que implementa ErpConnector, sem mexer no resto do sistema.
 *
 * Valores em dinheiro e quantidades trafegam como TEXTO ("12.90"),
 * nunca como number, para não perder centavos no caminho.
 */

export interface CategoriaErp {
  codigoErp: string;
  nome: string;
  /** Categoria "mãe" na hierarquia, ou null se for de primeiro nível */
  codigoErpPai: string | null;
}

export interface EanErp {
  codigo: string;
  /** Quantas unidades este código representa (1 = unidade, 12 = caixa) */
  quantidadeEmbalagem: number;
}

export interface ProdutoErp {
  codigoErp: string;
  descricao: string;
  codigoErpCategoria: string;
  unidade: 'UN' | 'KG';
  controlaLote: boolean;
  ativo: boolean;
  eans: EanErp[];
  /** Última alteração no ERP: base da sincronização incremental */
  alteradoEm: Date;
}

/** Preço, saldo e endereço de um produto em uma loja. */
export interface PosicaoLojaErp {
  codigoErpProduto: string;
  codigoLoja: string;
  preco: string;
  saldo: string;
  endereco: string | null;
  alteradoEm: Date;
}

/** Vendas de um produto em uma loja, em um dia. */
export interface VendaDiariaErp {
  codigoErpProduto: string;
  codigoLoja: string;
  /** Data no formato AAAA-MM-DD */
  data: string;
  quantidade: string;
  valorTotal: string;
}

export interface OpcoesListagem {
  /** Só o que mudou a partir deste momento (sincronização incremental) */
  alteradosDesde?: Date;
  /** Continuação de uma página anterior */
  cursor?: string;
  /** Quantos itens por página */
  limite?: number;
}

/** Uma página de resultados. Catálogos reais têm dezenas de milhares de itens. */
export interface PaginaErp<T> {
  itens: T[];
  /** null quando não há mais páginas */
  proximoCursor: string | null;
}

export interface ErpConnector {
  /** Nome do conector, para logs e diagnóstico */
  readonly nome: string;

  listarCategorias(): Promise<CategoriaErp[]>;

  listarProdutos(opcoes?: OpcoesListagem): Promise<PaginaErp<ProdutoErp>>;

  listarPosicoesLoja(
    codigoLoja: string,
    opcoes?: OpcoesListagem,
  ): Promise<PaginaErp<PosicaoLojaErp>>;

  /** Vendas diárias de uma loja entre duas datas (AAAA-MM-DD, inclusive) */
  listarVendasDiarias(codigoLoja: string, de: string, ate: string): Promise<VendaDiariaErp[]>;
}

/**
 * "Etiqueta" usada pela injeção de dependência.
 * Interfaces do TypeScript somem ao compilar para JavaScript, então o Nest
 * não consegue usá-las para saber o que injetar. O Symbol faz esse papel.
 */
export const ERP_CONNECTOR = Symbol('ERP_CONNECTOR');
