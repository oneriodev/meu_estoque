import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { HealthService, type HealthStatus } from './health.service.js';

@Public() // o monitoramento precisa consultar sem login
@ApiTags('health') // agrupa as rotas no Swagger
@Controller('health') // rota final: /api/v1/health
export class HealthController {
  // Injeção de dependência: o Nest cria o HealthService e entrega aqui
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Informa se a API e o banco de dados estão no ar' })
  @ApiOkResponse({ description: 'API e banco funcionando' })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados fora do ar' })
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
