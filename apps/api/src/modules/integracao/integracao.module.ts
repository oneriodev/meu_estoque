import { Module } from '@nestjs/common';
import { IntegracaoController } from './integracao.controller.js';
import { SincronizacaoCatalogoService } from './sincronizacao-catalogo.service.js';

@Module({
  controllers: [IntegracaoController],
  providers: [SincronizacaoCatalogoService],
})
export class IntegracaoModule {}
