import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  // Um PrismaService "de mentira" (mock): o teste unitário não precisa de banco
  const prismaFalso = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    prismaFalso.$queryRaw.mockReset();
    // Silencia o log de erro esperado, para não poluir a saída dos testes
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prismaFalso }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('retorna ok quando o banco responde', async () => {
    prismaFalso.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const resultado = await controller.check();

    expect(resultado.status).toBe('ok');
    expect(resultado.banco).toBe('ok');
  });

  it('responde 503 quando o banco está fora do ar', async () => {
    prismaFalso.$queryRaw.mockRejectedValue(new Error('conexão recusada'));

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
