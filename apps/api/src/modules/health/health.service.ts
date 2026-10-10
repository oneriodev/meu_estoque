import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface HealthStatus {
  status: 'ok';
  banco: 'ok';
  uptimeSegundos: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    try {
      // A consulta mais simples possível: só prova que o banco responde
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (erro) {
      // O detalhe vai para o log do servidor, nunca para quem chamou a API
      this.logger.error('Banco de dados indisponível', erro instanceof Error ? erro.stack : erro);
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }

    return {
      status: 'ok',
      banco: 'ok',
      uptimeSegundos: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
