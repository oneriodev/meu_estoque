import { Module } from '@nestjs/common';
import { LojasController } from './lojas.controller.js';
import { LojasService } from './lojas.service.js';

@Module({
  controllers: [LojasController],
  providers: [LojasService],
})
export class LojasModule {}
