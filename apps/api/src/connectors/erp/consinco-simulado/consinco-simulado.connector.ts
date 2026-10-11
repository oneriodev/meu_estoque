import { Injectable } from '@nestjs/common';
import { calcularDigitoVerificador } from '@meu-estoque/shared';
import type {
  CategoriaErp,
  ErpConnector,
  OpcoesListagem,
  PaginaErp,
  PosicaoLojaErp,
  ProdutoErp,
  VendaDiariaErp,
} from '../erp.connector.js';
import { criarGerador, hashTexto, inteiroEntre } from './aleatorio.js';
import { categoriasFicticias, lojasFicticias, modelosProduto } from './catalogo-ficticio.js';

/** Data de referência do catálogo fictício. */
const DATA_BASE = Date.UTC(2026, 9, 1); // 01/10/2026 (o mês começa em 0)
const UM_DIA = 24 * 60 * 60 * 1000;
const LIMITE_PADRAO = 50;

/**
 * Simula o ERP Consinco com dados FICTÍCIOS e reproduzíveis.
 *
 * Os códigos de barras usam o prefixo 04, que a GS1 reserva para uso interno
 * das empresas: eles nunca coincidem com o código de um produto real.
 * Os produtos de balança (KG) não têm EAN fixo: a balança gera um código
 * com o peso a cada pesagem (tratado na Etapa 7).
 */
@Injectable()
export class ConsincoSimuladoConnector implements ErpConnector {
  readonly nome = 'consinco-simulado';

  private readonly produtos: ProdutoErp[] = this.gerarProdutos();

  listarCategorias(): Promise<CategoriaErp[]> {
    return Promise.resolve(categoriasFicticias.map((categoria) => ({ ...categoria })));
  }

  listarProdutos(opcoes: OpcoesListagem = {}): Promise<PaginaErp<ProdutoErp>> {
    const filtrados = this.produtos.filter(
      (produto) => !opcoes.alteradosDesde || produto.alteradoEm >= opcoes.alteradosDesde,
    );
    return Promise.resolve(this.paginar(filtrados, opcoes));
  }

  listarPosicoesLoja(
    codigoLoja: string,
    opcoes: OpcoesListagem = {},
  ): Promise<PaginaErp<PosicaoLojaErp>> {
    if (!lojasFicticias.includes(codigoLoja as (typeof lojasFicticias)[number])) {
      return Promise.resolve({ itens: [], proximoCursor: null });
    }
    const posicoes = this.produtos
      .filter((produto) => produto.ativo)
      .map((produto, indice) => this.gerarPosicao(produto, indice, codigoLoja))
      .filter((posicao) => !opcoes.alteradosDesde || posicao.alteradoEm >= opcoes.alteradosDesde);
    return Promise.resolve(this.paginar(posicoes, opcoes));
  }

  listarVendasDiarias(codigoLoja: string, de: string, ate: string): Promise<VendaDiariaErp[]> {
    if (!lojasFicticias.includes(codigoLoja as (typeof lojasFicticias)[number])) {
      return Promise.resolve([]);
    }

    const vendas: VendaDiariaErp[] = [];
    const inicio = Date.parse(`${de}T00:00:00Z`);
    const fim = Date.parse(`${ate}T00:00:00Z`);

    for (let dia = inicio; dia <= fim; dia += UM_DIA) {
      const data = new Date(dia).toISOString().slice(0, 10);
      // Sexta e sábado vendem mais; domingo, menos
      const fatorDiaSemana = [0.7, 0.9, 0.9, 1, 1, 1.3, 1.4][new Date(dia).getUTCDay()] ?? 1;

      this.produtos.forEach((produto, indice) => {
        const modelo = modelosProduto[indice];
        if (!modelo || !produto.ativo) return;
        const gerador = criarGerador(`venda:${produto.codigoErp}:${codigoLoja}:${data}`);
        const media = modelo.giroDiario * fatorDiaSemana;
        // Variação de 40% para cima ou para baixo em torno da média
        const quantidade =
          produto.unidade === 'KG'
            ? Number((media * (0.6 + gerador() * 0.8)).toFixed(3))
            : Math.round(media * (0.6 + gerador() * 0.8));
        if (quantidade <= 0) return;

        const preco = Number(this.gerarPreco(modelo.preco, produto.codigoErp, codigoLoja));
        vendas.push({
          codigoErpProduto: produto.codigoErp,
          codigoLoja,
          data,
          quantidade: produto.unidade === 'KG' ? quantidade.toFixed(3) : String(quantidade),
          valorTotal: (Math.round(quantidade * preco * 100) / 100).toFixed(2),
        });
      });
    }
    return Promise.resolve(vendas);
  }

  // ─── Geração dos dados fictícios ────────────────────────────────────────────

  private gerarProdutos(): ProdutoErp[] {
    return modelosProduto.map((modelo, indice) => {
      const codigoErp = String(10_001 + indice);
      const unidade = modelo.unidade ?? 'UN';
      // Alguns produtos "mudaram" depois da data base, para testar a sincronização incremental
      const diasDepois = hashTexto(`alteracao:${codigoErp}`) % 10;

      return {
        codigoErp,
        descricao: modelo.descricao,
        codigoErpCategoria: modelo.categoria,
        unidade,
        controlaLote: modelo.controlaLote ?? true,
        ativo: true,
        eans: unidade === 'KG' ? [] : this.gerarEans(indice, modelo.caixa),
        alteradoEm: new Date(DATA_BASE + diasDepois * UM_DIA),
      };
    });
  }

  /** EAN-13 da unidade e, se houver caixa, um GTIN-14 com indicador 1. */
  private gerarEans(indice: number, unidadesPorCaixa?: number): ProdutoErp['eans'] {
    // 04 (uso interno) + 10 dígitos sequenciais = 12 dígitos, mais o verificador
    const base = `04${String(indice).padStart(10, '0')}`;
    const ean13 = `${base}${calcularDigitoVerificador(base)}`;
    const eans = [{ codigo: ean13, quantidadeEmbalagem: 1 }];

    if (unidadesPorCaixa) {
      // GTIN-14 da caixa: indicador "1" + os 12 primeiros dígitos do EAN-13 + novo verificador
      const baseCaixa = `1${base}`;
      eans.push({
        codigo: `${baseCaixa}${calcularDigitoVerificador(baseCaixa)}`,
        quantidadeEmbalagem: unidadesPorCaixa,
      });
    }
    return eans;
  }

  private gerarPosicao(produto: ProdutoErp, indice: number, codigoLoja: string): PosicaoLojaErp {
    const modelo = modelosProduto[indice];
    const gerador = criarGerador(`posicao:${produto.codigoErp}:${codigoLoja}`);
    const giro = modelo?.giroDiario ?? 5;

    // Saldo entre 0 e ~12 dias de venda. ~5% em ruptura (zero) e ~2% negativo,
    // situações reais que o motor de análise vai detectar na Etapa 10.
    const sorteio = gerador();
    let saldo: number;
    if (sorteio < 0.02) saldo = -inteiroEntre(gerador, 1, 5);
    else if (sorteio < 0.07) saldo = 0;
    else saldo = inteiroEntre(gerador, 1, Math.max(3, Math.round(giro * 12)));

    const corredor = String(inteiroEntre(gerador, 1, 12)).padStart(2, '0');
    const gondola = String(inteiroEntre(gerador, 1, 20)).padStart(2, '0');

    return {
      codigoErpProduto: produto.codigoErp,
      codigoLoja,
      preco: this.gerarPreco(modelo?.preco ?? 10, produto.codigoErp, codigoLoja),
      saldo: produto.unidade === 'KG' ? (saldo * 1.5).toFixed(3) : String(saldo),
      endereco: `C${corredor}-G${gondola}`,
      alteradoEm: produto.alteradoEm,
    };
  }

  /** Preço de referência com variação de até 5% por loja, terminando em ,x9. */
  private gerarPreco(referencia: number, codigoErp: string, codigoLoja: string): string {
    const gerador = criarGerador(`preco:${codigoErp}:${codigoLoja}`);
    const variado = referencia * (0.95 + gerador() * 0.1);
    const terminadoEmNove = Math.floor(variado * 10) / 10 + 0.09;
    return terminadoEmNove.toFixed(2);
  }

  private paginar<T>(itens: T[], opcoes: OpcoesListagem): PaginaErp<T> {
    const inicio = opcoes.cursor ? Number(opcoes.cursor) : 0;
    const limite = opcoes.limite ?? LIMITE_PADRAO;
    const fim = inicio + limite;
    return {
      itens: itens.slice(inicio, fim),
      proximoCursor: fim < itens.length ? String(fim) : null,
    };
  }
}
