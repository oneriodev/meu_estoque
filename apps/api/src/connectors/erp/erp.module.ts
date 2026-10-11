import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { ConsincoSimuladoConnector } from './consinco-simulado/consinco-simulado.connector.js';
import { ERP_CONNECTOR, type ErpConnector } from './erp.connector.js';

/**
 * Escolhe qual conector de ERP a API vai usar, conforme a variável ERP_CONECTOR.
 * Quem precisar do ERP pede @Inject(ERP_CONNECTOR) e recebe "um ErpConnector",
 * sem saber (nem precisar saber) qual é.
 */
@Global()
@Module({
  providers: [
    ConsincoSimuladoConnector,
    {
      provide: ERP_CONNECTOR,
      inject: [ConfigService, ConsincoSimuladoConnector],
      useFactory: (
        config: ConfigService<Env, true>,
        simulado: ConsincoSimuladoConnector,
      ): ErpConnector => {
        const escolhido = config.get('ERP_CONECTOR', { infer: true });
        switch (escolhido) {
          case 'consinco-simulado':
            return simulado;
          // Futuro: case 'consinco-api': return new ConsincoApiConnector(...)
        }
      },
    },
  ],
  exports: [ERP_CONNECTOR],
})
export class ErpModule {}
