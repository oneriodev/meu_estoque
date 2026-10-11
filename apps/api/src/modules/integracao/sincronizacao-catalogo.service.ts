import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ERP_CONNECTOR,
  type ErpConnector,
  type PaginaErp,
  type ProdutoErp,
} from '../../connectors/erp/erp.connector.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface ResumoSincronizacao {
  conector: string;
  categorias: number;
  produtos: number;
  eans: number;
  posicoes: number;
  /** Registros que vieram do ERP mas não puderam ser gravados (ex.: categoria desconhecida) */
  ignorados: number;
  duracaoMs: number;
}

/**
 * Copia o catálogo do ERP para o nosso banco: categorias, produtos, EANs
 * e, para cada loja, preço, saldo e endereço.
 *
 * Pode rodar quantas vezes for preciso: tudo é "upsert" (cria ou atualiza),
 * então rodar duas vezes seguidas não duplica nada (idempotência).
 */
@Injectable()
export class SincronizacaoCatalogoService {
  private readonly logger = new Logger(SincronizacaoCatalogoService.name);
  private emAndamento = false;

  constructor(
    private readonly prisma: PrismaService,
    // A interface, não uma classe concreta: o serviço não sabe qual ERP está do outro lado
    @Inject(ERP_CONNECTOR) private readonly erp: ErpConnector,
  ) {}

  async sincronizarTudo(): Promise<ResumoSincronizacao> {
    // Duas sincronizações ao mesmo tempo gravariam os mesmos dados em paralelo
    if (this.emAndamento) {
      throw new ConflictException('Já existe uma sincronização em andamento');
    }
    this.emAndamento = true;
    const inicio = Date.now();

    try {
      const idsCategorias = await this.sincronizarCategorias();
      const produtos = await this.sincronizarProdutos(idsCategorias);
      const posicoes = await this.sincronizarPosicoes();

      const resumo: ResumoSincronizacao = {
        conector: this.erp.nome,
        categorias: idsCategorias.size,
        produtos: produtos.gravados,
        eans: produtos.eans,
        posicoes: posicoes.gravadas,
        ignorados: produtos.ignorados + posicoes.ignoradas,
        duracaoMs: Date.now() - inicio,
      };
      this.logger.log(`Sincronização concluída: ${JSON.stringify(resumo)}`);
      return resumo;
    } finally {
      // "finally" roda mesmo se der erro no meio: a trava nunca fica presa
      this.emAndamento = false;
    }
  }

  /** Grava as categorias e devolve o mapa "código no ERP" → "id no nosso banco". */
  private async sincronizarCategorias(): Promise<Map<string, string>> {
    const categorias = await this.erp.listarCategorias();
    const ids = new Map<string, string>();

    // 1ª passada: grava todas, ainda sem a categoria "mãe"
    // (a mãe pode vir depois da filha na lista)
    for (const categoria of categorias) {
      const salva = await this.prisma.categoria.upsert({
        where: { codigoErp: categoria.codigoErp },
        update: { nome: categoria.nome, excluidoEm: null },
        create: { codigoErp: categoria.codigoErp, nome: categoria.nome },
      });
      ids.set(categoria.codigoErp, salva.id);
    }

    // 2ª passada: agora que todas existem, liga cada filha à sua mãe
    for (const categoria of categorias) {
      const paiId = categoria.codigoErpPai ? (ids.get(categoria.codigoErpPai) ?? null) : null;
      await this.prisma.categoria.update({
        where: { codigoErp: categoria.codigoErp },
        data: { paiId },
      });
    }
    return ids;
  }

  private async sincronizarProdutos(
    idsCategorias: Map<string, string>,
  ): Promise<{ gravados: number; eans: number; ignorados: number }> {
    let gravados = 0;
    let eans = 0;
    let ignorados = 0;

    // Percorre o catálogo página por página, sem carregar tudo na memória
    for await (const produto of this.todasAsPaginas((cursor) =>
      this.erp.listarProdutos({ cursor }),
    )) {
      const categoriaId = idsCategorias.get(produto.codigoErpCategoria);
      if (!categoriaId) {
        this.logger.warn(
          `Produto ${produto.codigoErp} ignorado: categoria ${produto.codigoErpCategoria} desconhecida`,
        );
        ignorados++;
        continue;
      }
      await this.gravarProduto(produto, categoriaId);
      gravados++;
      eans += produto.eans.length;
    }
    return { gravados, eans, ignorados };
  }

  /** Grava um produto e seus EANs numa única transação: ou grava tudo, ou nada. */
  private async gravarProduto(produto: ProdutoErp, categoriaId: string): Promise<void> {
    const agora = new Date();
    const dados = {
      descricao: produto.descricao,
      categoriaId,
      unidade: produto.unidade,
      controlaLote: produto.controlaLote,
      // Produto desativado no ERP: exclusão lógica (a linha fica, para a sincronização dos aparelhos)
      excluidoEm: produto.ativo ? null : agora,
    };

    await this.prisma.$transaction(async (tx) => {
      const salvo = await tx.produto.upsert({
        where: { codigoErp: produto.codigoErp },
        update: dados,
        create: { codigoErp: produto.codigoErp, ...dados },
      });

      for (const ean of produto.eans) {
        await tx.ean.upsert({
          where: { codigo: ean.codigo },
          update: {
            produtoId: salvo.id,
            quantidadeEmbalagem: ean.quantidadeEmbalagem,
            excluidoEm: null,
          },
          create: {
            codigo: ean.codigo,
            produtoId: salvo.id,
            quantidadeEmbalagem: ean.quantidadeEmbalagem,
          },
        });
      }

      // EANs que o ERP não lista mais para este produto: exclusão lógica
      await tx.ean.updateMany({
        where: {
          produtoId: salvo.id,
          excluidoEm: null,
          codigo: { notIn: produto.eans.map((ean) => ean.codigo) },
        },
        data: { excluidoEm: agora },
      });
    });
  }

  /** Preço, saldo e endereço de cada produto, em cada loja ativa. */
  private async sincronizarPosicoes(): Promise<{ gravadas: number; ignoradas: number }> {
    const lojas = await this.prisma.loja.findMany({
      where: { ativa: true },
      select: { id: true, codigo: true },
    });
    const produtos = await this.prisma.produto.findMany({
      select: { id: true, codigoErp: true },
    });
    const idsProdutos = new Map(produtos.map((produto) => [produto.codigoErp, produto.id]));

    let gravadas = 0;
    let ignoradas = 0;

    for (const loja of lojas) {
      for await (const posicao of this.todasAsPaginas((cursor) =>
        this.erp.listarPosicoesLoja(loja.codigo, { cursor }),
      )) {
        const produtoId = idsProdutos.get(posicao.codigoErpProduto);
        if (!produtoId) {
          ignoradas++;
          continue;
        }
        const dados = {
          // O Prisma converte o texto "28.79" para Decimal sem passar por number
          preco: posicao.preco,
          saldo: posicao.saldo,
          endereco: posicao.endereco,
          ativo: true,
        };
        await this.prisma.produtoLoja.upsert({
          where: { produtoId_lojaId: { produtoId, lojaId: loja.id } },
          update: dados,
          create: { produtoId, lojaId: loja.id, ...dados },
        });
        gravadas++;
      }
    }
    return { gravadas, ignoradas };
  }

  /**
   * Gerador assíncrono: entrega os itens um a um, buscando a próxima página
   * só quando a anterior acabou. Quem usa escreve um simples "for await".
   */
  private async *todasAsPaginas<T>(
    buscarPagina: (cursor: string | undefined) => Promise<PaginaErp<T>>,
  ): AsyncGenerator<T> {
    let cursor: string | undefined;
    do {
      const pagina = await buscarPagina(cursor);
      yield* pagina.itens;
      cursor = pagina.proximoCursor ?? undefined;
    } while (cursor);
  }
}
