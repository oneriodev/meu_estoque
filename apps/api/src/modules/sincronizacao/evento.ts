import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';

/**
 * Tudo o que um "aplicador" de evento precisa saber: qual evento, quem enviou,
 * de qual loja e quando aconteceu no aparelho.
 * Fica num arquivo próprio para os módulos (tarefas, lotes...) usarem sem
 * depender do serviço de eventos (evita importação circular).
 */
export interface ContextoEvento {
  /** UUID gerado no aparelho: também vira o id do registro no histórico (ex.: tarefa_eventos) */
  eventoId: string;
  lojaId: string;
  usuario: UsuarioAutenticado;
  /** Horário do APARELHO (pode estar errado; o do servidor fica em recebidoEm) */
  ocorridoEm: Date;
}

/**
 * Lançado por um aplicador quando o evento viola uma regra de negócio
 * (ex.: aceitar uma tarefa já concluída). O evento é REJEITADO e não volta mais.
 * A mensagem é mostrada ao operador: escreva para ele entender.
 */
export class EventoRejeitado extends Error {}
