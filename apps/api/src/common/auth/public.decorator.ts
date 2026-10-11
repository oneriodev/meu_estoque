import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'rotaPublica';

/**
 * Marca uma rota como pública (sem login), como o health check e o próprio login.
 * Todas as outras rotas exigem token: o padrão é fechado, não aberto.
 */
export const Public = () => SetMetadata(ROTA_PUBLICA, true);
