import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { LojaResumo } from '@meu-estoque/shared';
import { ExigeLoja } from '../../common/auth/exige-loja.decorator.js';
import { Perfis } from '../../common/auth/perfis.decorator.js';
import { LojasService, type MembroEquipe } from './lojas.service.js';

@ApiTags('lojas')
@ApiBearerAuth()
@Controller('lojas')
export class LojasController {
  constructor(private readonly lojasService: LojasService) {}

  @Get(':lojaId')
  @ExigeLoja() // só quem tem acesso à loja
  @ApiOperation({ summary: 'Dados de uma loja' })
  @ApiOkResponse({ description: 'Loja encontrada' })
  @ApiForbiddenResponse({ description: 'Sem acesso a esta loja' })
  buscar(@Param('lojaId') lojaId: string): Promise<LojaResumo> {
    return this.lojasService.buscar(lojaId);
  }

  @Get(':lojaId/equipe')
  @Perfis('SUPERVISOR', 'ADMINISTRADOR') // só gestores...
  @ExigeLoja() // ...e só da própria loja
  @ApiOperation({ summary: 'Equipe da loja (supervisor e administrador)' })
  @ApiOkResponse({ description: 'Lista da equipe' })
  @ApiForbiddenResponse({ description: 'Perfil sem acesso ou loja de outro gestor' })
  listarEquipe(@Param('lojaId') lojaId: string): Promise<MembroEquipe[]> {
    return this.lojasService.listarEquipe(lojaId);
  }
}
