import { Module } from '@nestjs/common';
import { TarefasModule } from '../tarefas/tarefas.module.js';
import { EventosService } from './eventos.service.js';
import { SincronizacaoController } from './sincronizacao.controller.js';
import { SincronizacaoService } from './sincronizacao.service.js';

/** Sincronização com os aparelhos: pull incremental (servidor → app) e push de eventos (app → servidor). */
@Module({
  imports: [TarefasModule],
  controllers: [SincronizacaoController],
  providers: [SincronizacaoService, EventosService],
})
export class SincronizacaoModule {}
