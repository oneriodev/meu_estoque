import { SetMetadata } from '@nestjs/common';
import type { PapelUsuario } from '@meu-estoque/shared';

export const PERFIS_PERMITIDOS = 'perfisPermitidos';

/**
 * Restringe a rota a alguns perfis.
 * Uso: @Perfis('SUPERVISOR', 'ADMINISTRADOR')
 * Rotas sem @Perfis aceitam qualquer usuário logado.
 */
export const Perfis = (...perfis: PapelUsuario[]) => SetMetadata(PERFIS_PERMITIDOS, perfis);
