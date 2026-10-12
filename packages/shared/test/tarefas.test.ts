import { describe, expect, it } from 'vitest';
import {
  acoesPermitidas,
  dadosAcaoTarefaSchema,
  resultadoDaAcao,
  validarAcao,
} from '../src/tarefas.js';

const operador = { id: 'op-1', papel: 'OPERADOR' as const };
const colega = { id: 'op-2', papel: 'OPERADOR' as const };
const gestor = { id: 'sup-1', papel: 'SUPERVISOR' as const };

describe('máquina de estados da tarefa', () => {
  it('tarefa pendente sem dono: o operador pode aceitar, iniciar direto ou cancelar', () => {
    expect(acoesPermitidas({ status: 'GERADA', responsavelId: null }, operador)).toEqual([
      'ACEITAR',
      'INICIAR',
      'CANCELAR',
    ]);
  });

  it('tarefa aceita por mim: iniciar, devolver, impedir ou cancelar', () => {
    expect(acoesPermitidas({ status: 'ACEITA', responsavelId: 'op-1' }, operador)).toEqual([
      'INICIAR',
      'DEVOLVER',
      'IMPEDIR',
      'CANCELAR',
    ]);
  });

  it('tarefa de um colega: o operador não pode fazer nada; o gestor pode', () => {
    const tarefa = { status: 'EM_EXECUCAO' as const, responsavelId: 'op-2' };
    expect(acoesPermitidas(tarefa, operador)).toEqual([]);
    expect(acoesPermitidas(tarefa, gestor)).toEqual(['CONCLUIR', 'IMPEDIR', 'CANCELAR']);
  });

  it('aceitar tarefa já assumida explica o motivo', () => {
    expect(validarAcao({ status: 'ACEITA', responsavelId: 'op-2' }, operador, 'ACEITAR')).toBe(
      'Esta tarefa já foi assumida por outra pessoa',
    );
  });

  it('concluída é final: nenhuma ação, nem do gestor', () => {
    const concluida = { status: 'CONCLUIDA' as const, responsavelId: 'op-1' };
    expect(acoesPermitidas(concluida, operador)).toEqual([]);
    expect(acoesPermitidas(concluida, gestor)).toEqual([]);
  });

  it('reabrir é só do gestor', () => {
    const impedida = { status: 'IMPEDIDA' as const, responsavelId: 'op-1' };
    expect(validarAcao(impedida, operador, 'REABRIR')).toBe('Somente o gestor pode fazer isso');
    expect(validarAcao(impedida, gestor, 'REABRIR')).toBeNull();
  });

  it('cancelar e impedir exigem motivo também no formato do evento', () => {
    const semMotivo = { tarefaId: '0192f3c4-1111-7000-8000-000000000001', acao: 'CANCELAR' };
    expect(dadosAcaoTarefaSchema.safeParse(semMotivo).success).toBe(false);
    expect(
      dadosAcaoTarefaSchema.safeParse({ ...semMotivo, motivo: 'Produto em falta' }).success,
    ).toBe(true);
    expect(validarAcao({ status: 'ACEITA', responsavelId: 'op-1' }, colega, 'INICIAR')).toBe(
      'Esta tarefa foi assumida por outra pessoa',
    );
  });

  it('resultado da ação: quem aceita assume; devolver solta; concluir mantém o responsável', () => {
    expect(resultadoDaAcao({ responsavelId: null }, 'ACEITAR', 'eu')).toEqual({
      status: 'ACEITA',
      responsavelId: 'eu',
    });
    expect(resultadoDaAcao({ responsavelId: 'eu' }, 'DEVOLVER', 'eu')).toEqual({
      status: 'GERADA',
      responsavelId: null,
    });
    // Gestor iniciando a tarefa de um operador: a tarefa continua com o operador
    expect(resultadoDaAcao({ responsavelId: 'operador' }, 'INICIAR', 'gestor')).toEqual({
      status: 'EM_EXECUCAO',
      responsavelId: 'operador',
    });
  });
});
