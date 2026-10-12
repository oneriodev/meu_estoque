import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  enviarEventosRequestSchema,
  pullQuerySchema,
  type EnviarEventosRequest,
  type EnviarEventosResponse,
  type PullQuery,
  type PullResponse,
} from '@meu-estoque/shared';
import { ExigeLoja } from '../../common/auth/exige-loja.decorator.js';
import { UsuarioAtual } from '../../common/auth/usuario-atual.decorator.js';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { EventosService } from './eventos.service.js';
import { SincronizacaoService } from './sincronizacao.service.js';

@ApiTags('sincronizacao')
@ApiBearerAuth()
@Controller('lojas/:lojaId/sincronizacao')
@ExigeLoja() // vale para as duas rotas: só quem tem acesso à loja
// A carga inicial faz várias chamadas seguidas, e os aparelhos de uma loja costumam
// sair pelo MESMO IP (a internet da loja): por isso um limite maior que o geral
@Throttle({ default: { limit: 300, ttl: 60_000 } })
export class SincronizacaoController {
  constructor(
    private readonly sincronizacaoService: SincronizacaoService,
    private readonly eventosService: EventosService,
  ) {}

  @Get('alteracoes')
  @ApiOperation({
    summary: 'Pull incremental: o que mudou no catálogo, preços, saldos e lotes da loja',
    description:
      'Sem cursor: carga inicial completa. Repita com o cursor devolvido enquanto temMais for true.',
  })
  @ApiOkResponse({ description: 'Página de alterações' })
  @ApiBadRequestResponse({ description: 'Cursor inválido ou de outra loja' })
  @ApiForbiddenResponse({ description: 'Sem acesso a esta loja' })
  buscarAlteracoes(
    @Param('lojaId') lojaId: string,
    @Query({ schema: pullQuerySchema }) query: PullQuery,
  ): Promise<PullResponse> {
    return this.sincronizacaoService.buscarAlteracoes(lojaId, query);
  }

  @Post('eventos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Push: recebe os eventos da fila (outbox) do aparelho',
    description:
      'Idempotente: reenviar o mesmo evento (mesmo id) não o aplica de novo. ' +
      'Cada evento tem seu resultado: APLICADO, DUPLICADO ou REJEITADO (não reenviar).',
  })
  @ApiOkResponse({ description: 'Resultado de cada evento, na mesma ordem do envio' })
  @ApiForbiddenResponse({ description: 'Sem acesso a esta loja' })
  receberEventos(
    @Param('lojaId') lojaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body({ schema: enviarEventosRequestSchema }) corpo: EnviarEventosRequest,
  ): Promise<EnviarEventosResponse> {
    return this.eventosService.receber(lojaId, usuario, corpo);
  }
}
