import {
  enviarEventosResponseSchema,
  MAXIMO_EVENTOS_POR_ENVIO,
  pullResponseSchema,
} from '@meu-estoque/shared';
import {
  aplicarPagina,
  limparCopiaLocal,
  limparTarefasAntigas,
} from '@/db/repositorios/catalogoRepositorio';
import { gravarEstado, lerEstado } from '@/db/repositorios/estadoRepositorio';
import {
  marcarRejeitado,
  proximoLote,
  registrarFalha,
  removerEnviados,
  type ItemOutbox,
} from '@/db/repositorios/outboxRepositorio';
import { gravarTarefa } from '@/db/repositorios/tarefaRepositorio';
import { api, ErroApi } from './api';

/** Registros por página do pull. Páginas menores = transações mais curtas no aparelho. */
const LIMITE_PULL = 500;

/**
 * PULL: baixa do servidor o que mudou desde a última vez e grava na cópia local.
 * Sem cursor salvo, é a carga inicial da loja (tudo).
 * Devolve quantos registros chegaram.
 */
export async function puxarAlteracoes(
  lojaId: string,
  aoProgredir?: (recebidos: number) => void,
): Promise<number> {
  // A cópia local é de UMA loja. Se o operador trocou de loja, começa do zero.
  if (lerEstado('lojaId') !== lojaId) {
    limparCopiaLocal();
    gravarEstado('lojaId', lojaId);
  }

  let cursor = lerEstado('cursor');
  let recebidos = 0;
  let recomecou = false;

  for (;;) {
    const parametros = new URLSearchParams({ limite: String(LIMITE_PULL) });
    if (cursor) parametros.set('cursor', cursor);

    let pagina;
    try {
      pagina = await api(`/lojas/${lojaId}/sincronizacao/alteracoes?${parametros.toString()}`, {
        schema: pullResponseSchema,
      });
    } catch (erro) {
      // 400 com cursor = o servidor não aceita mais o nosso cursor (formato antigo, outra loja...).
      // Recomeça a carga do zero, mas só uma vez, para não entrar em laço.
      if (erro instanceof ErroApi && erro.status === 400 && cursor && !recomecou) {
        recomecou = true;
        limparCopiaLocal();
        gravarEstado('lojaId', lojaId);
        cursor = null;
        continue;
      }
      throw erro;
    }

    recebidos += aplicarPagina(pagina.alteracoes, pagina.cursor);
    aoProgredir?.(recebidos);
    cursor = pagina.cursor;

    if (!pagina.temMais) {
      limparTarefasAntigas();
      gravarEstado('ultimaSincronizacao', pagina.servidorEm);
      return recebidos;
    }
  }
}

/** Erros que valem nova tentativa mais tarde: sem rede, servidor fora, excesso de requisições. */
function ehErroTemporario(erro: unknown): boolean {
  return (
    erro instanceof ErroApi && (erro.status === 0 || erro.status === 429 || erro.status >= 500)
  );
}

/**
 * PUSH: envia a fila (outbox) do usuário, lote por lote, na ordem.
 * Devolve quantos eventos saíram da fila. Falha temporária para o envio e agenda nova tentativa.
 */
export async function enviarFila(usuarioId: string): Promise<number> {
  let enviados = 0;

  for (;;) {
    const lote = proximoLote(usuarioId, MAXIMO_EVENTOS_POR_ENVIO);
    const primeiro = lote[0];
    if (!primeiro) return enviados;

    let resposta;
    try {
      resposta = await api(`/lojas/${primeiro.lojaId}/sincronizacao/eventos`, {
        metodo: 'POST',
        corpo: { eventos: lote.map(paraEnvelope) },
        schema: enviarEventosResponseSchema,
      });
    } catch (erro) {
      if (ehErroTemporario(erro)) {
        registrarFalha(lote, erro instanceof Error ? erro.message : 'Falha no envio');
        throw erro; // o motor mostra "sem conexão" e tenta de novo depois
      }
      if (erro instanceof ErroApi && (erro.status === 400 || erro.status === 403)) {
        // O lote inteiro foi recusado (formato inválido ou sem acesso à loja):
        // reenviar daria o mesmo erro para sempre, então os eventos saem da fila como rejeitados
        for (const item of lote) marcarRejeitado(item.id, erro.message);
        continue;
      }
      throw erro; // 401: a sessão acabou (o app volta ao login); os eventos continuam guardados
    }

    const porId = new Map(resposta.resultados.map((resultado) => [resultado.id, resultado]));
    const concluidos: string[] = [];
    const semResposta: ItemOutbox[] = [];
    // O lote é de UMA loja; só gravamos a tarefa devolvida se for a loja da cópia local
    const mesmaLoja = primeiro.lojaId === lerEstado('lojaId');
    for (const item of lote) {
      const resultado = porId.get(item.id);
      // Estado da tarefa depois do evento: a tela fica certa sem esperar o próximo pull
      if (resultado?.tarefa && mesmaLoja) gravarTarefa(resultado.tarefa);
      if (!resultado) semResposta.push(item);
      else if (resultado.status === 'REJEITADO')
        marcarRejeitado(item.id, resultado.motivo ?? 'Rejeitado');
      else concluidos.push(item.id); // APLICADO ou DUPLICADO
    }
    removerEnviados(concluidos);
    enviados += concluidos.length;

    if (semResposta.length > 0) {
      // Não deveria acontecer; por segurança, tentam de novo mais tarde
      registrarFalha(semResposta, 'Sem resposta do servidor para o evento');
      return enviados;
    }
  }
}

function paraEnvelope(item: ItemOutbox) {
  return {
    id: item.id,
    tipo: item.tipo,
    ocorridoEm: item.ocorridoEm,
    dados: JSON.parse(item.dados) as unknown,
  };
}
