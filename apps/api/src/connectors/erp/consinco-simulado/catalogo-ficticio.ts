/**
 * Catálogo FICTÍCIO usado pelo conector simulado.
 * Nomes genéricos, preços aproximados de mercado e nenhuma marca ou dado real.
 */

export interface ModeloProduto {
  descricao: string;
  categoria: string;
  /** Preço de referência em reais */
  preco: number;
  /** Venda média diária aproximada por loja (o "giro") */
  giroDiario: number;
  unidade?: 'UN' | 'KG';
  controlaLote?: boolean;
  /** Unidades por caixa, quando o produto também é vendido em caixa */
  caixa?: number;
}

export const categoriasFicticias = [
  { codigoErp: '100', nome: 'Mercearia', codigoErpPai: null },
  { codigoErp: '110', nome: 'Grãos e Cereais', codigoErpPai: '100' },
  { codigoErp: '120', nome: 'Matinais', codigoErpPai: '100' },
  { codigoErp: '200', nome: 'Perecíveis', codigoErpPai: null },
  { codigoErp: '210', nome: 'Laticínios', codigoErpPai: '200' },
  { codigoErp: '220', nome: 'Frios', codigoErpPai: '200' },
  { codigoErp: '230', nome: 'Hortifruti', codigoErpPai: '200' },
  { codigoErp: '300', nome: 'Bebidas', codigoErpPai: null },
  { codigoErp: '400', nome: 'Limpeza', codigoErpPai: null },
  { codigoErp: '500', nome: 'Higiene', codigoErpPai: null },
] as const;

export const modelosProduto: ModeloProduto[] = [
  { descricao: 'Arroz tipo 1 5kg', categoria: '110', preco: 27.9, giroDiario: 18, caixa: 6 },
  { descricao: 'Feijão carioca 1kg', categoria: '110', preco: 8.49, giroDiario: 22, caixa: 10 },
  { descricao: 'Feijão preto 1kg', categoria: '110', preco: 9.29, giroDiario: 9, caixa: 10 },
  {
    descricao: 'Macarrão espaguete 500g',
    categoria: '110',
    preco: 4.79,
    giroDiario: 15,
    caixa: 20,
  },
  { descricao: 'Farinha de trigo 1kg', categoria: '110', preco: 5.99, giroDiario: 8, caixa: 10 },
  { descricao: 'Açúcar cristal 2kg', categoria: '110', preco: 9.49, giroDiario: 12, caixa: 10 },
  {
    descricao: 'Café torrado e moído 500g',
    categoria: '120',
    preco: 19.9,
    giroDiario: 14,
    caixa: 10,
  },
  { descricao: 'Achocolatado em pó 400g', categoria: '120', preco: 8.99, giroDiario: 6, caixa: 12 },
  { descricao: 'Cereal matinal 300g', categoria: '120', preco: 13.49, giroDiario: 4, caixa: 12 },
  {
    descricao: 'Biscoito cream cracker 350g',
    categoria: '120',
    preco: 5.49,
    giroDiario: 11,
    caixa: 20,
  },
  { descricao: 'Leite UHT integral 1L', categoria: '210', preco: 5.29, giroDiario: 45, caixa: 12 },
  { descricao: 'Iogurte natural 170g', categoria: '210', preco: 3.49, giroDiario: 10 },
  { descricao: 'Iogurte morango 1kg', categoria: '210', preco: 11.9, giroDiario: 5 },
  { descricao: 'Manteiga com sal 200g', categoria: '210', preco: 12.49, giroDiario: 6 },
  { descricao: 'Requeijão cremoso 200g', categoria: '210', preco: 8.99, giroDiario: 7 },
  { descricao: 'Queijo muçarela', categoria: '220', preco: 49.9, giroDiario: 4, unidade: 'KG' },
  { descricao: 'Presunto cozido', categoria: '220', preco: 39.9, giroDiario: 3, unidade: 'KG' },
  { descricao: 'Mortadela', categoria: '220', preco: 24.9, giroDiario: 3, unidade: 'KG' },
  { descricao: 'Salsicha 500g', categoria: '220', preco: 9.99, giroDiario: 6 },
  {
    descricao: 'Banana prata',
    categoria: '230',
    preco: 6.99,
    giroDiario: 12,
    unidade: 'KG',
    controlaLote: false,
  },
  {
    descricao: 'Tomate',
    categoria: '230',
    preco: 8.49,
    giroDiario: 10,
    unidade: 'KG',
    controlaLote: false,
  },
  {
    descricao: 'Batata',
    categoria: '230',
    preco: 5.99,
    giroDiario: 9,
    unidade: 'KG',
    controlaLote: false,
  },
  { descricao: 'Refrigerante cola 2L', categoria: '300', preco: 9.99, giroDiario: 25, caixa: 6 },
  { descricao: 'Água mineral 1,5L', categoria: '300', preco: 2.99, giroDiario: 30, caixa: 6 },
  { descricao: 'Suco de laranja 1L', categoria: '300', preco: 7.49, giroDiario: 8, caixa: 12 },
  { descricao: 'Cerveja lata 350ml', categoria: '300', preco: 3.79, giroDiario: 40, caixa: 12 },
  {
    descricao: 'Detergente líquido 500ml',
    categoria: '400',
    preco: 2.79,
    giroDiario: 16,
    caixa: 24,
  },
  { descricao: 'Sabão em pó 1,6kg', categoria: '400', preco: 21.9, giroDiario: 5, caixa: 9 },
  { descricao: 'Água sanitária 2L', categoria: '400', preco: 6.49, giroDiario: 7, caixa: 6 },
  { descricao: 'Desinfetante 2L', categoria: '400', preco: 9.99, giroDiario: 5, caixa: 6 },
  { descricao: 'Papel higiênico 12 rolos', categoria: '500', preco: 19.9, giroDiario: 9, caixa: 4 },
  { descricao: 'Creme dental 90g', categoria: '500', preco: 4.99, giroDiario: 8, caixa: 12 },
  { descricao: 'Sabonete 85g', categoria: '500', preco: 2.49, giroDiario: 10, caixa: 12 },
  { descricao: 'Shampoo 350ml', categoria: '500', preco: 14.9, giroDiario: 4, caixa: 12 },
];

/** As mesmas lojas fictícias do seed (prisma/seed.ts). */
export const lojasFicticias = ['01', '02', '03'] as const;
