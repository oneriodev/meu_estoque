import { Injectable } from '@nestjs/common';
import {
  type Alteracoes,
  type CategoriaSync,
  type EanSync,
  type LoteSync,
  type ProdutoLojaSync,
  type ProdutoSync,
  type PullQuery,
  type PullResponse,
  STATUS_ABERTOS,
  type TarefaResumo,
} from '@meu-estoque/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { paraResumo, selecaoResumo } from '../tarefas/tarefas.service.js';
import {
  codificarCursor,
  decodificarCursor,
  ENTIDADES_PULL,
  type EntidadePull,
  type Marca,
  marcasIniciais,
} from './cursor.js';

/**
 * Margem de segurança do pull. Só entregamos registros alterados até 2 s atrás.
 *
 * Por quê? Duas transações podem gravar em paralelo: a que começou primeiro
 * (atualizadoEm menor) pode terminar DEPOIS. Se entregássemos até "agora",
 * o aparelho avançaria a marca e nunca veria essa linha atrasada.
 * Com a margem, damos tempo para as transações em andamento terminarem.
 */
const HORIZONTE_MS = 2_000;

/** Tarefas encerradas continuam indo para o aparelho por este tempo (histórico recente). */
const DIAS_TAREFAS_ENCERRADAS = 7;

/** Resultado da busca de uma entidade: as linhas, a nova marca e se ficou algo para trás. */
interface PaginaEntidade<T> {
  linhas: T[];
  marca: Marca;
  temMais: boolean;
}

/** Filtro "alterado depois da marca e até o horizonte", ordenado por (atualizadoEm, id). */
function depoisDaMarca(marca: Marca, ate: Date) {
  return {
    atualizadoEm: { lte: ate },
    ...(marca && {
      OR: [
        { atualizadoEm: { gt: new Date(marca.em) } },
        { atualizadoEm: new Date(marca.em), id: { gt: marca.id } },
      ],
    }),
  };
}

const ORDEM_KEYSET = [{ atualizadoEm: 'asc' as const }, { id: 'asc' as const }];

/** Pega uma linha a mais que o limite: se ela vier, sabemos que há mais páginas. */
function cortar<T extends { atualizadoEm: Date }>(
  registros: T[],
  limite: number,
  chave: (registro: T) => string,
): { registros: T[]; marca: Marca; temMais: boolean } {
  const temMais = registros.length > limite;
  const pagina = temMais ? registros.slice(0, limite) : registros;
  const ultimo = pagina.at(-1);
  return {
    registros: pagina,
    marca: ultimo ? { em: ultimo.atualizadoEm.toISOString(), id: chave(ultimo) } : null,
    temMais,
  };
}

/**
 * Pull incremental: devolve o que mudou desde o cursor, em páginas.
 * Sem cursor, devolve tudo (é a carga inicial da loja).
 */
@Injectable()
export class SincronizacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async buscarAlteracoes(lojaId: string, { cursor, limite }: PullQuery): Promise<PullResponse> {
    const marcas = cursor ? decodificarCursor(cursor, lojaId) : marcasIniciais();
    const ate = new Date(Date.now() - HORIZONTE_MS);
    const alteracoes: Alteracoes = {
      categorias: [],
      produtos: [],
      eans: [],
      produtosLoja: [],
      lotes: [],
      tarefas: [],
    };

    let restante = limite;
    let temMais = false;

    // Esgota uma entidade antes de passar para a próxima
    for (const entidade of ENTIDADES_PULL) {
      if (restante === 0) {
        temMais = true;
        break;
      }
      const pagina = await this.buscarEntidade(entidade, lojaId, marcas[entidade], ate, restante);
      // Atribuição por entidade: o TypeScript não consegue ligar o tipo de "pagina" à chave dinâmica
      (alteracoes[entidade] as unknown[]) = pagina.linhas;
      if (pagina.marca) marcas[entidade] = pagina.marca;
      restante -= pagina.linhas.length;
      if (pagina.temMais) {
        temMais = true;
        break;
      }
    }

    return {
      alteracoes,
      cursor: codificarCursor(lojaId, marcas),
      temMais,
      servidorEm: new Date().toISOString(),
    };
  }

  private buscarEntidade(
    entidade: EntidadePull,
    lojaId: string,
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<unknown>> {
    switch (entidade) {
      case 'categorias':
        return this.categorias(marca, ate, limite);
      case 'produtos':
        return this.produtos(marca, ate, limite);
      case 'eans':
        return this.eans(marca, ate, limite);
      case 'produtosLoja':
        return this.produtosLoja(lojaId, marca, ate, limite);
      case 'lotes':
        return this.lotes(lojaId, marca, ate, limite);
      case 'tarefas':
        return this.tarefas(lojaId, marca, ate, limite);
    }
  }

  private async categorias(
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<CategoriaSync>> {
    const { registros, ...resto } = cortar(
      await this.prisma.categoria.findMany({
        where: depoisDaMarca(marca, ate),
        orderBy: ORDEM_KEYSET,
        take: limite + 1,
      }),
      limite,
      (c) => c.id,
    );
    return {
      ...resto,
      linhas: registros.map((c) => ({
        id: c.id,
        codigoErp: c.codigoErp,
        nome: c.nome,
        paiId: c.paiId,
        excluido: c.excluidoEm !== null,
      })),
    };
  }

  private async produtos(
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<ProdutoSync>> {
    const { registros, ...resto } = cortar(
      await this.prisma.produto.findMany({
        where: depoisDaMarca(marca, ate),
        orderBy: ORDEM_KEYSET,
        take: limite + 1,
      }),
      limite,
      (p) => p.id,
    );
    return {
      ...resto,
      linhas: registros.map((p) => ({
        id: p.id,
        codigoErp: p.codigoErp,
        descricao: p.descricao,
        categoriaId: p.categoriaId,
        unidade: p.unidade,
        controlaLote: p.controlaLote,
        excluido: p.excluidoEm !== null,
      })),
    };
  }

  private async eans(marca: Marca, ate: Date, limite: number): Promise<PaginaEntidade<EanSync>> {
    const { registros, ...resto } = cortar(
      await this.prisma.ean.findMany({
        where: depoisDaMarca(marca, ate),
        orderBy: ORDEM_KEYSET,
        take: limite + 1,
      }),
      limite,
      (e) => e.id,
    );
    return {
      ...resto,
      linhas: registros.map((e) => ({
        id: e.id,
        codigo: e.codigo,
        produtoId: e.produtoId,
        quantidadeEmbalagem: e.quantidadeEmbalagem,
        excluido: e.excluidoEm !== null,
      })),
    };
  }

  /** ProdutoLoja tem chave composta (produtoId + lojaId): dentro da loja, o desempate é o produtoId. */
  private async produtosLoja(
    lojaId: string,
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<ProdutoLojaSync>> {
    const { registros, ...resto } = cortar(
      await this.prisma.produtoLoja.findMany({
        where: {
          lojaId,
          atualizadoEm: { lte: ate },
          ...(marca && {
            OR: [
              { atualizadoEm: { gt: new Date(marca.em) } },
              { atualizadoEm: new Date(marca.em), produtoId: { gt: marca.id } },
            ],
          }),
        },
        orderBy: [{ atualizadoEm: 'asc' }, { produtoId: 'asc' }],
        take: limite + 1,
      }),
      limite,
      (p) => p.produtoId,
    );
    return {
      ...resto,
      linhas: registros.map((p) => ({
        produtoId: p.produtoId,
        // Texto com casas fixas: "28.79", "12.500". Nunca number (float perde centavos)
        preco: p.preco.toFixed(2),
        saldo: p.saldo.toFixed(3),
        endereco: p.endereco,
        excluido: !p.ativo,
      })),
    };
  }

  private async lotes(
    lojaId: string,
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<LoteSync>> {
    const { registros, ...resto } = cortar(
      await this.prisma.lote.findMany({
        where: { lojaId, ...depoisDaMarca(marca, ate) },
        orderBy: ORDEM_KEYSET,
        take: limite + 1,
      }),
      limite,
      (l) => l.id,
    );
    return {
      ...resto,
      linhas: registros.map((l) => ({
        id: l.id,
        produtoId: l.produtoId,
        codigo: l.codigo,
        // @db.Date chega como meia-noite UTC: pegamos só "AAAA-MM-DD"
        validade: l.validade.toISOString().slice(0, 10),
        quantidadeEstimada: l.quantidadeEstimada.toFixed(3),
        excluido: l.excluidoEm !== null,
      })),
    };
  }

  /**
   * Tarefas da loja: todas as abertas, mais as encerradas nos últimos dias.
   * Uma tarefa que muda de status (ex.: alguém a concluiu) ganha atualizadoEm novo
   * e chega aos outros aparelhos no próximo pull: é assim que a equipe vê o que o colega fez.
   */
  private async tarefas(
    lojaId: string,
    marca: Marca,
    ate: Date,
    limite: number,
  ): Promise<PaginaEntidade<TarefaResumo>> {
    const desde = new Date(Date.now() - DIAS_TAREFAS_ENCERRADAS * 24 * 60 * 60 * 1000);
    const { registros, ...resto } = cortar(
      await this.prisma.tarefa.findMany({
        where: {
          lojaId,
          AND: [
            depoisDaMarca(marca, ate),
            { OR: [{ status: { in: [...STATUS_ABERTOS] } }, { atualizadoEm: { gte: desde } }] },
          ],
        },
        select: selecaoResumo,
        orderBy: ORDEM_KEYSET,
        take: limite + 1,
      }),
      limite,
      (t) => t.id,
    );
    return { ...resto, linhas: registros.map(paraResumo) };
  }
}
