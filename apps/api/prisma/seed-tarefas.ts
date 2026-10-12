/**
 * Tarefas FICTÍCIAS de exemplo para DESENVOLVIMENTO, na loja 01.
 * Simulam o que o motor de análise vai gerar sozinho a partir da Etapa 10,
 * para já termos uma fila para testar o app e o painel.
 *
 * Pré-requisito: o catálogo sincronizado com o ERP simulado (POST /integracao/erp/sincronizar).
 * Pode rodar várias vezes: tarefas que já existem não são duplicadas nem alteradas.
 *
 * Rodar: npm run db:seed:tarefas
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient, type TipoTarefa } from '../src/generated/prisma/client.js';

config({ path: ['.env', '../../.env'], quiet: true });

const env = z
  .object({ DATABASE_URL: z.string().min(1), NODE_ENV: z.string().default('development') })
  .parse(process.env);

// Proteção: dados de exemplo nunca vão para produção
if (env.NODE_ENV === 'production') {
  console.error('seed-tarefas é só para desenvolvimento.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

const HORA = 60 * 60 * 1000;

/** Ids fixos: rodar o script de novo encontra a mesma tarefa em vez de criar outra. */
const exemplos: {
  id: string;
  tipo: TipoTarefa;
  produto: string;
  titulo: string;
  descricao: string;
  prioridade: number;
  prazoEmHoras: number | null;
}[] = [
  {
    id: '01990000-0000-7000-8000-000000000001',
    tipo: 'VALIDADE',
    produto: '10012',
    titulo: 'Conferir validade: Iogurte natural 170g',
    descricao:
      'Lote vence em 7 dias. Conferir a gôndola e trazer para a frente o que vence primeiro.',
    prioridade: 90,
    prazoEmHoras: 2,
  },
  {
    id: '01990000-0000-7000-8000-000000000002',
    tipo: 'REPOSICAO',
    produto: '10001',
    titulo: 'Repor gôndola: Arroz tipo 1 5kg',
    descricao: 'Estoque baixo na área de venda e saldo disponível no depósito.',
    prioridade: 80,
    prazoEmHoras: 4,
  },
  {
    id: '01990000-0000-7000-8000-000000000003',
    tipo: 'RUPTURA',
    produto: '10002',
    titulo: 'Verificar ruptura: Feijão carioca 1kg',
    descricao: 'Sem venda há 2 dias, mas com saldo em estoque. Produto pode estar fora da gôndola.',
    prioridade: 70,
    prazoEmHoras: 3,
  },
  {
    id: '01990000-0000-7000-8000-000000000004',
    tipo: 'CONTAGEM',
    produto: '10016',
    titulo: 'Contar: Queijo muçarela',
    descricao: 'Divergência entre a venda e o saldo informado pelo ERP.',
    prioridade: 60,
    prazoEmHoras: null,
  },
  {
    id: '01990000-0000-7000-8000-000000000005',
    tipo: 'AUDITORIA_PRECO',
    produto: '10007',
    titulo: 'Conferir etiqueta de preço: Café torrado e moído 500g',
    descricao: 'Preço alterado no ERP hoje. Conferir se a etiqueta da gôndola foi trocada.',
    prioridade: 40,
    prazoEmHoras: 8,
  },
];

async function main(): Promise<void> {
  const loja = await prisma.loja.findUnique({ where: { codigo: '01' } });
  if (!loja) throw new Error('Loja 01 não encontrada: rode antes "npm run db:seed".');

  let criadas = 0;
  for (const exemplo of exemplos) {
    if (await prisma.tarefa.findUnique({ where: { id: exemplo.id }, select: { id: true } }))
      continue;

    const produto = await prisma.produto.findUnique({ where: { codigoErp: exemplo.produto } });
    if (!produto) {
      throw new Error(
        `Produto ${exemplo.produto} não encontrado: sincronize o catálogo com o ERP antes.`,
      );
    }

    await prisma.$transaction([
      prisma.tarefa.create({
        data: {
          id: exemplo.id,
          lojaId: loja.id,
          tipo: exemplo.tipo,
          origem: 'AUTOMATICA',
          prioridade: exemplo.prioridade,
          titulo: exemplo.titulo,
          descricao: exemplo.descricao,
          produtoId: produto.id,
          prazo:
            exemplo.prazoEmHoras === null
              ? null
              : new Date(Date.now() + exemplo.prazoEmHoras * HORA),
        },
      }),
      prisma.tarefaEvento.create({
        data: {
          id: randomUUID(),
          tarefaId: exemplo.id,
          statusNovo: 'GERADA',
          ocorridoEm: new Date(),
          motivo: 'Gerada pelo script de exemplo (desenvolvimento)',
        },
      }),
    ]);
    criadas++;
    console.log(`✔ ${exemplo.titulo}`);
  }
  console.log(
    criadas ? `${criadas} tarefa(s) criada(s) na loja 01.` : 'As tarefas de exemplo já existiam.',
  );
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
