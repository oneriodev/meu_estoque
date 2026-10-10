import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, type HealthStatus } from './health.service.js';

@ApiTags('health') // agrupa as rotas no Swagger
@Controller('health') // rota final: /api/v1/health
export class HealthController {
  // Injeção de dependência: o Nest cria o HealthService e entrega aqui
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Informa se a API está no ar' })
  @ApiOkResponse({ description: 'API funcionando' })
  check(): HealthStatus {
    return this.healthService.check();
  }
}
