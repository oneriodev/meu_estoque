import { Module } from '@nestjs/common';
import { TarefasController } from './tarefas.controller.js';
import { TarefasService } from './tarefas.service.js';

/** Motor de tarefas: regras do ciclo de vida, fila do gestor e histórico. */
@Module({
  controllers: [TarefasController],
  providers: [TarefasService],
  // Exportado: a sincronização usa o serviço para aplicar os eventos de tarefa da outbox
  exports: [TarefasService],
})
export class TarefasModule {}
