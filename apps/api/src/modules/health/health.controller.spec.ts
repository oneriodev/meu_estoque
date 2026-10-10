import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('retorna status ok', () => {
    const resultado = controller.check();
    expect(resultado.status).toBe('ok');
    expect(resultado.uptimeSegundos).toBeGreaterThanOrEqual(0);
  });
});
