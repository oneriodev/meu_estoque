import {
  dadosAcaoTarefaSchema,
  dadosCriarTarefaSchema,
  NOMES_ACOES,
  REGRAS_ACOES,
  resultadoDaAcao,
  STATUS_ABERTOS,
  type TarefaResumo,
} from '@meu-estoque/shared';
import { bancoLocal } from '../cliente';
import { produtos, tarefas } from '../schema';
import { eventosDoUsuario, type ItemOutbox } from './outboxRepositorio';

const TIPOS_EVENTO_TAREFA = ['TAREFA_CRIADA', 'TAREFA_ACAO'];

export type TarefaLocal = TarefaResumo & {
  /** Há ação deste aparelho ainda não confirmada pelo servidor */
  pendente: boolean;
  /** Descrição do produto (do catálogo local), para a lista */
  produtoDescricao: string | null;
};

export interface Recusa {
  eventoId: string;
  tarefaId: string;
  /** O que a pessoa tentou fazer: "Aceitar", "Concluir"... */
  acao: string;
  motivo: string;
}

interface UsuarioAtual {
  id: string;
  nome: string;
}

/**
 * As tarefas COMO A PESSOA DEVE VÊ-LAS:
 * a cópia do servidor (último pull) + as ações dela que ainda estão na outbox.
 *
 * Por que não gravar a ação direto na tabela de tarefas? Porque o servidor pode RECUSAR
 * (ex.: um colega aceitou primeiro). Calculando a tela a partir das duas fontes,
 * quando a ação é recusada ela simplesmente deixa de ser aplicada e a tela volta
 * a mostrar o que o servidor sabe. Nada para "desfazer" à mão.
 */
export function listarTarefas(usuario: UsuarioAtual): TarefaLocal[] {
  const banco = bancoLocal();
  const nomesProdutos = new Map(
    banco
      .select({ id: produtos.id, descricao: produtos.descricao })
      .from(produtos)
      .all()
      .map((p) => [p.id, p.descricao]),
  );

  const porId = new Map<string, TarefaLocal>();
  for (const tarefa of banco.select().from(tarefas).all()) {
    porId.set(tarefa.id, { ...tarefa, pendente: false, produtoDescricao: null });
  }

  for (const evento of eventosDoUsuario(usuario.id, TIPOS_EVENTO_TAREFA, 'PENDENTE')) {
    aplicarEvento(porId, evento, usuario);
  }

  return [...porId.values()]
    .map((t) => ({
      ...t,
      produtoDescricao: t.produtoId ? (nomesProdutos.get(t.produtoId) ?? null) : null,
    }))
    .sort(ordemDaFila);
}

/** Uma ação pendente aplicada sobre a tarefa (com as mesmas regras que o servidor usa). */
function aplicarEvento(
  porId: Map<string, TarefaLocal>,
  evento: ItemOutbox,
  usuario: UsuarioAtual,
): void {
  const dados: unknown = JSON.parse(evento.dados);

  if (evento.tipo === 'TAREFA_CRIADA') {
    const criada = dadosCriarTarefaSchema.safeParse(dados);
    if (!criada.success || porId.has(criada.data.tarefaId)) return;
    porId.set(criada.data.tarefaId, {
      id: criada.data.tarefaId,
      tipo: criada.data.tipo,
      status: 'GERADA',
      origem: 'MANUAL',
      prioridade: criada.data.prioridade,
      titulo: criada.data.titulo,
      descricao: criada.data.descricao ?? null,
      produtoId: criada.data.produtoId ?? null,
      loteId: null,
      responsavelId: null,
      responsavelNome: null,
      prazo: null,
      criadoEm: evento.ocorridoEm,
      atualizadoEm: evento.ocorridoEm,
      pendente: true,
      produtoDescricao: null,
    });
    return;
  }

  const acao = dadosAcaoTarefaSchema.safeParse(dados);
  if (!acao.success) return;
  const tarefa = porId.get(acao.data.tarefaId);
  // Se a ação não vale mais a partir do status atual, o servidor vai recusar: não aplicamos
  if (!tarefa || !REGRAS_ACOES[acao.data.acao].de.includes(tarefa.status)) return;

  const novo = resultadoDaAcao(tarefa, acao.data.acao, usuario.id);
  porId.set(tarefa.id, {
    ...tarefa,
    ...novo,
    responsavelNome:
      novo.responsavelId === null
        ? null
        : novo.responsavelId === usuario.id
          ? usuario.nome
          : tarefa.responsavelNome,
    atualizadoEm: evento.ocorridoEm,
    pendente: true,
  });
}

/** Abertas primeiro; entre elas, maior prioridade e prazo mais próximo. */
function ordemDaFila(a: TarefaLocal, b: TarefaLocal): number {
  const abertaA = STATUS_ABERTOS.includes(a.status) ? 0 : 1;
  const abertaB = STATUS_ABERTOS.includes(b.status) ? 0 : 1;
  if (abertaA !== abertaB) return abertaA - abertaB;
  if (abertaA === 1) return b.atualizadoEm.localeCompare(a.atualizadoEm); // encerradas: recentes primeiro
  if (a.prioridade !== b.prioridade) return b.prioridade - a.prioridade;
  return (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999');
}

/** Ações do usuário que o servidor recusou, com o motivo (para avisar na tela). */
export function listarRecusas(usuarioId: string): Recusa[] {
  return eventosDoUsuario(usuarioId, TIPOS_EVENTO_TAREFA, 'REJEITADO').flatMap((evento) => {
    const dados = JSON.parse(evento.dados) as {
      tarefaId?: string;
      acao?: keyof typeof NOMES_ACOES;
    };
    if (!dados.tarefaId) return [];
    return [
      {
        eventoId: evento.id,
        tarefaId: dados.tarefaId,
        acao:
          evento.tipo === 'TAREFA_CRIADA' ? 'Criar' : dados.acao ? NOMES_ACOES[dados.acao] : 'Ação',
        motivo: evento.ultimoErro ?? 'Recusada pelo servidor',
      },
    ];
  });
}

/** Está atrasada? (prazo vencido e ainda aberta) */
export function estaAtrasada(
  tarefa: Pick<TarefaResumo, 'prazo' | 'status'>,
  agora = new Date(),
): boolean {
  return (
    tarefa.prazo !== null &&
    STATUS_ABERTOS.includes(tarefa.status) &&
    tarefa.prazo < agora.toISOString()
  );
}

/**
 * Grava uma tarefa que veio de uma rota online (ex.: o gestor redistribuiu).
 * Assim a tela muda na hora, sem esperar o próximo pull (que trará a mesma linha).
 */
export function gravarTarefa(tarefa: TarefaResumo): void {
  bancoLocal()
    .insert(tarefas)
    .values(tarefa)
    .onConflictDoUpdate({ target: tarefas.id, set: tarefa })
    .run();
}
