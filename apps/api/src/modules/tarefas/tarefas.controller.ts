import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  atribuirTarefaRequestSchema,
  criarTarefaRequestSchema,
  filaTarefasQuerySchema,
  type AtribuirTarefaRequest,
  type CriarTarefaRequest,
  type FilaTarefasQuery,
  type ResumoFila,
  type TarefaDetalhe,
  type TarefaResumo,
} from '@meu-estoque/shared';
import { ExigeLoja } from '../../common/auth/exige-loja.decorator.js';
import { Perfis } from '../../common/auth/perfis.decorator.js';
import { UsuarioAtual } from '../../common/auth/usuario-atual.decorator.js';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { TarefasService } from './tarefas.service.js';

/**
 * Rotas ONLINE de tarefas (fila do gestor, criação e redistribuição).
 * As ações do operador no dia a dia (aceitar, iniciar, concluir...) NÃO passam por aqui:
 * elas vão pela fila outbox (/sincronizacao/eventos), para funcionarem offline.
 */
@ApiTags('tarefas')
@ApiBearerAuth()
@Controller('lojas/:lojaId/tarefas')
@ExigeLoja()
export class TarefasController {
  constructor(private readonly tarefasService: TarefasService) {}

  @Get()
  @Perfis('SUPERVISOR', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Fila de tarefas da loja (padrão: só as abertas)' })
  @ApiOkResponse({ description: 'Tarefas, das mais urgentes para as menos' })
  @ApiForbiddenResponse({ description: 'Somente gestores, e só da própria loja' })
  listar(
    @Param('lojaId') lojaId: string,
    @Query({ schema: filaTarefasQuerySchema }) filtros: FilaTarefasQuery,
  ): Promise<TarefaResumo[]> {
    return this.tarefasService.listarFila(lojaId, filtros);
  }

  // Declarada ANTES de ":tarefaId": senão "resumo" seria lido como um id de tarefa
  @Get('resumo')
  @Perfis('SUPERVISOR', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Números da fila: pendentes, em execução, atrasadas...' })
  resumo(@Param('lojaId') lojaId: string): Promise<ResumoFila> {
    return this.tarefasService.resumoFila(lojaId);
  }

  @Get(':tarefaId')
  @ApiOperation({ summary: 'Detalhe da tarefa com o histórico completo' })
  @ApiNotFoundResponse({ description: 'Tarefa não encontrada nesta loja' })
  detalhar(
    @Param('lojaId') lojaId: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
  ): Promise<TarefaDetalhe> {
    return this.tarefasService.detalhar(lojaId, tarefaId);
  }

  @Post()
  @Perfis('SUPERVISOR', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Gestor cria uma tarefa (pode já definir responsável e prazo)' })
  criar(
    @Param('lojaId') lojaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body({ schema: criarTarefaRequestSchema }) corpo: CriarTarefaRequest,
  ): Promise<TarefaResumo> {
    return this.tarefasService.criarPeloGestor(lojaId, usuario, corpo);
  }

  @Post(':tarefaId/atribuir')
  @Perfis('SUPERVISOR', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Redistribui a tarefa (responsavelId null = devolve para a fila)' })
  atribuir(
    @Param('lojaId') lojaId: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body({ schema: atribuirTarefaRequestSchema }) corpo: AtribuirTarefaRequest,
  ): Promise<TarefaResumo> {
    return this.tarefasService.atribuir(lojaId, usuario, tarefaId, corpo);
  }
}
