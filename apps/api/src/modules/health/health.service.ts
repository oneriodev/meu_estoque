import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  uptimeSegundos: number;
  timestamp: string;
}

/**
 * Regra de negócio do health check.
 * Na Etapa 2C ele passa a verificar também a conexão com o PostgreSQL.
 */
@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      uptimeSegundos: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
