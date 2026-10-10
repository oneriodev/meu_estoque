import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * @Global: o PrismaService fica disponível em todos os módulos
 * sem precisar importar o DatabaseModule em cada um.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
