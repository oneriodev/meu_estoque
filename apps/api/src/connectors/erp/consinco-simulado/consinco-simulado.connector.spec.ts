import { gtinSchema } from '@meu-estoque/shared';
import type { ProdutoErp } from '../erp.connector.js';
import { ConsincoSimuladoConnector } from './consinco-simulado.connector.js';

/** Lê todas as páginas de produtos. */
async function todosOsProdutos(conector: ConsincoSimuladoConnector): Promise<ProdutoErp[]> {
  const produtos: ProdutoErp[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await conector.listarProdutos({ cursor, limite: 10 });
    produtos.push(...pagina.itens);
    cursor = pagina.proximoCursor ?? undefined;
  } while (cursor);
  return produtos;
}

describe('ConsincoSimuladoConnector', () => {
  const conector = new ConsincoSimuladoConnector();

  it('gera sempre os mesmos dados (reproduzível)', async () => {
    const outro = new ConsincoSimuladoConnector();
    expect(await outro.listarProdutos()).toEqual(await conector.listarProdutos());
    expect(await outro.listarPosicoesLoja('01')).toEqual(await conector.listarPosicoesLoja('01'));
  });

  it('pagina o catálogo sem perder nem repetir produtos', async () => {
    const produtos = await todosOsProdutos(conector);
    const codigos = new Set(produtos.map((produto) => produto.codigoErp));
    expect(produtos.length).toBeGreaterThan(30);
    expect(codigos.size).toBe(produtos.length);
  });

  it('todo produto aponta para uma categoria existente', async () => {
    const categorias = new Set((await conector.listarCategorias()).map((c) => c.codigoErp));
    for (const produto of await todosOsProdutos(conector)) {
      expect(categorias.has(produto.codigoErpCategoria)).toBe(true);
    }
  });

  it('todos os EANs têm dígito verificador válido e são únicos', async () => {
    const eans = (await todosOsProdutos(conector)).flatMap((produto) => produto.eans);
    for (const ean of eans) {
      expect(gtinSchema.safeParse(ean.codigo).success).toBe(true);
    }
    expect(new Set(eans.map((ean) => ean.codigo)).size).toBe(eans.length);
  });

  it('a unidade tem EAN-13 e a caixa tem GTIN-14', async () => {
    const eans = (await todosOsProdutos(conector)).flatMap((produto) => produto.eans);
    for (const ean of eans) {
      expect(ean.codigo).toHaveLength(ean.quantidadeEmbalagem === 1 ? 13 : 14);
    }
  });

  it('produtos de balança (KG) não têm EAN fixo', async () => {
    const pesaveis = (await todosOsProdutos(conector)).filter((p) => p.unidade === 'KG');
    expect(pesaveis.length).toBeGreaterThan(0);
    expect(pesaveis.every((produto) => produto.eans.length === 0)).toBe(true);
  });

  it('a sincronização incremental devolve só o que mudou', async () => {
    const todos = await todosOsProdutos(conector);
    const desde = new Date(Date.UTC(2026, 9, 6));
    const alterados = (await conector.listarProdutos({ alteradosDesde: desde, limite: 1000 }))
      .itens;

    expect(alterados.length).toBeGreaterThan(0);
    expect(alterados.length).toBeLessThan(todos.length);
    expect(alterados.every((produto) => produto.alteradoEm >= desde)).toBe(true);
  });

  it('preços vêm como texto com 2 casas decimais', async () => {
    const { itens } = await conector.listarPosicoesLoja('01', { limite: 1000 });
    expect(itens.length).toBeGreaterThan(0);
    for (const posicao of itens) {
      expect(posicao.preco).toMatch(/^\d+\.\d{2}$/);
      expect(Number(posicao.preco)).toBeGreaterThan(0);
    }
  });

  it('loja desconhecida não tem posições nem vendas', async () => {
    expect((await conector.listarPosicoesLoja('99')).itens).toHaveLength(0);
    expect(await conector.listarVendasDiarias('99', '2026-10-01', '2026-10-07')).toHaveLength(0);
  });

  it('gera vendas diárias dentro do período pedido', async () => {
    const vendas = await conector.listarVendasDiarias('02', '2026-10-01', '2026-10-07');
    const datas = new Set(vendas.map((venda) => venda.data));

    expect(vendas.length).toBeGreaterThan(0);
    expect([...datas].every((data) => data >= '2026-10-01' && data <= '2026-10-07')).toBe(true);
    expect(datas.size).toBe(7);
  });
});
