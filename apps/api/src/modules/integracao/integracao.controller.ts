import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Perfis } from '../../common/auth/perfis.decorator.js';
import {
  type ResumoSincronizacao,
  SincronizacaoCatalogoService,
} from './sincronizacao-catalogo.service.js';

@ApiTags('integração')
@ApiBearerAuth()
@Controller('integracao')
export class IntegracaoController {
  constructor(private readonly sincronizacao: SincronizacaoCatalogoService) {}

  @Post('erp/sincronizar')
  @Perfis('ADMINISTRADOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Copia categorias, produtos, EANs, preços e saldos do ERP' })
  @ApiOkResponse({ description: 'Resumo do que foi sincronizado' })
  @ApiForbiddenResponse({ description: 'Somente administradores' })
  @ApiConflictResponse({ description: 'Já existe uma sincronização em andamento' })
  sincronizar(): Promise<ResumoSincronizacao> {
    return this.sincronizacao.sincronizarTudo();
  }
}
